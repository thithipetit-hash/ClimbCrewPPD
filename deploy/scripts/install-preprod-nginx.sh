#!/usr/bin/env bash
set -euo pipefail

PPD_DOMAIN="${1:?Usage: install-preprod-nginx.sh <ppd-domain> [prod-site] [ppd-site]}"
PROD_SITE="${2:-/etc/nginx/sites-enabled/climbcrew}"
PPD_SITE="${3:-/etc/nginx/sites-enabled/climbcrew-preprod}"
PROD_DOMAIN="${PROD_DOMAIN:-climbcrew.dip-tcs.com}"

for command in sudo nginx awk grep install readlink curl mktemp; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: commande requise absente: $command" >&2
    exit 1
  }
done

sudo test -e "$PROD_SITE" || {
  echo "ERROR: vhost partagé absent: $PROD_SITE" >&2
  exit 1
}

PROD_REAL="$(readlink -f "$PROD_SITE")"
test -n "$PROD_REAL"
sudo test -f "$PROD_REAL"

PROD_BACKUP="$(mktemp)"
PPD_BACKUP="$(mktemp)"
RENDERED="$(mktemp)"
PPD_EXISTED=false

cleanup_temp() {
  rm -f "$PROD_BACKUP" "$PPD_BACKUP" "$RENDERED"
}

reload_nginx() {
  if ! sudo systemctl reload nginx 2>/dev/null; then
    sudo nginx -s reload
  fi
}

sudo cp "$PROD_REAL" "$PROD_BACKUP"
if sudo test -e "$PPD_SITE"; then
  sudo cp -L "$PPD_SITE" "$PPD_BACKUP"
  PPD_EXISTED=true
fi

restore_nginx() {
  local status=$?
  trap - ERR
  echo "Restauration de la configuration Nginx précédente." >&2
  sudo install -m 0644 "$PROD_BACKUP" "$PROD_REAL" || true
  if [ "$PPD_EXISTED" = true ]; then
    sudo install -m 0644 "$PPD_BACKUP" "$PPD_SITE" || true
  else
    sudo rm -f "$PPD_SITE" || true
  fi
  sudo nginx -t || true
  reload_nginx || true
  cleanup_temp
  exit "$status"
}
trap restore_nginx ERR

# La PPD validée publiquement utilise le même vhost HTTP que le domaine
# principal. Le frontal TLS amont conserve le Host ; Nginx sélectionne donc
# ce vhost partagé et relaie vers la pile ClimbCrew locale.
awk -v prod="$PROD_DOMAIN" -v ppd="$PPD_DOMAIN" '
  BEGIN { found = 0 }
  {
    if ($0 ~ /^[[:space:]]*server_name[[:space:]]/ && index($0, prod) > 0) {
      found = 1
      if (index($0, ppd) == 0) {
        sub(/[[:space:]]*;[[:space:]]*$/, " " ppd ";")
      }
    }
    print
  }
  END {
    if (!found) exit 42
  }
' "$PROD_BACKUP" > "$RENDERED" || {
  echo "ERROR: directive server_name contenant ${PROD_DOMAIN} introuvable dans ${PROD_REAL}." >&2
  exit 1
}

sudo install -m 0644 "$RENDERED" "$PROD_REAL"

# Un ancien vhost PPD dédié entrerait en conflit avec le server_name partagé.
# Il est donc supprimé de façon transactionnelle ; le trap le restaure si un
# contrôle ultérieur échoue.
if [ "$PPD_SITE" != "$PROD_SITE" ] && [ "$(readlink -f "$PPD_SITE" 2>/dev/null || true)" != "$PROD_REAL" ]; then
  sudo rm -f "$PPD_SITE"
fi

PROD_ESCAPED="${PROD_DOMAIN//./\\.}"
PPD_ESCAPED="${PPD_DOMAIN//./\\.}"
sudo grep -Eq "server_name[^;]*${PROD_ESCAPED}[^;]*${PPD_ESCAPED}[^;]*;|server_name[^;]*${PPD_ESCAPED}[^;]*${PROD_ESCAPED}[^;]*;" "$PROD_REAL" || {
  echo "ERROR: les domaines production et PPD ne partagent pas la même directive server_name." >&2
  exit 1
}

sudo nginx -t
reload_nginx

# Vérifie les deux Host locaux avant toute bascule applicative. Le TLS public
# est terminé en amont ; ces requêtes testent directement le contrat Nginx.
for host in "$PROD_DOMAIN" "$PPD_DOMAIN"; do
  curl --fail --silent --show-error --max-time 10 \
    -H "Host: ${host}" \
    "http://127.0.0.1/deployment-version.json?nginx-probe=${host}" >/dev/null
  echo "Routage Nginx local OK pour ${host}."
done

trap - ERR
cleanup_temp
echo "Vhost partagé installé : ${PROD_DOMAIN} + ${PPD_DOMAIN}."
