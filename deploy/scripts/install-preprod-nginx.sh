#!/usr/bin/env bash
set -euo pipefail

PPD_DOMAIN="${1:?Usage: install-preprod-nginx.sh <ppd-domain> [prod-site] [ppd-site] [template]}"
PROD_SITE="${2:-/etc/nginx/sites-enabled/climbcrew}"
PPD_SITE="${3:-/etc/nginx/sites-enabled/climbcrew-preprod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${4:-${SCRIPT_DIR}/../nginx/pre-climbcrew.reverse-proxy.conf.template}"
PROD_DOMAIN="${PROD_DOMAIN:-climbcrew.dip-tcs.com}"

for command in sudo nginx sed install readlink curl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: commande requise absente: $command" >&2
    exit 1
  }
done

sudo test -e "$PROD_SITE" || {
  echo "ERROR: vhost production absent: $PROD_SITE" >&2
  exit 1
}
test -f "$TEMPLATE" || {
  echo "ERROR: template PPD absent: $TEMPLATE" >&2
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
  sudo cp "$PPD_SITE" "$PPD_BACKUP"
  PPD_EXISTED=true
fi

restore_nginx() {
  local status=$?
  trap - ERR
  echo "Restauration de la configuration Nginx précédente." >&2
  sudo cp "$PROD_BACKUP" "$PROD_REAL" || true
  if [ "$PPD_EXISTED" = true ]; then
    sudo cp "$PPD_BACKUP" "$PPD_SITE" || true
  else
    sudo rm -f "$PPD_SITE" || true
  fi
  sudo nginx -t || true
  reload_nginx || true
  cleanup_temp
  exit "$status"
}
trap restore_nginx ERR

# L'ancienne PPD partageait le server_name de production. On retire uniquement
# le domaine PPD de ce vhost avant d'installer un serveur HTTP indépendant.
PPD_ESCAPED="${PPD_DOMAIN//./\\.}"
sudo sed -i -E "s/[[:space:]]+${PPD_ESCAPED}([[:space:]]*;)/\\1/g" "$PROD_REAL"

sed -e "s|__PPD_DOMAIN__|${PPD_DOMAIN}|g" "$TEMPLATE" > "$RENDERED"
sudo install -m 0644 "$RENDERED" "$PPD_SITE"

sudo grep -Eq "server_name[[:space:]]+${PPD_ESCAPED}[[:space:]]*;" "$PPD_SITE"
if sudo grep -Eq "server_name[^;]*${PPD_ESCAPED}[^;]*;" "$PROD_REAL"; then
  echo "ERROR: le domaine PPD est encore présent dans le vhost production." >&2
  exit 1
fi
PROD_ESCAPED="${PROD_DOMAIN//./\\.}"
sudo grep -Eq "server_name[^;]*${PROD_ESCAPED}[^;]*;" "$PROD_REAL"

sudo nginx -t
reload_nginx

# Vérifie le routage Host local avant toute bascule applicative. Le TLS public
# est terminé en amont ; cette requête teste donc directement le Nginx hôte.
curl --fail --silent --show-error --max-time 10 \
  -H "Host: ${PPD_DOMAIN}" \
  "http://127.0.0.1/deployment-version.json?nginx-probe=1" >/dev/null

trap - ERR
cleanup_temp
echo "Vhost HTTP PPD dédié installé pour ${PPD_DOMAIN}."
