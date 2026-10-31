#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${1:?Usage: rollback-preprod.sh <deploy-root> <previous-sha> <backup-file> [ppd-domain] [candidate-started|auto]}"
PREVIOUS_SHA="${2:?SHA précédent requis}"
BACKUP_FILE="${3:-}"
PPD_DOMAIN="${4:-pre-climbcrew.dip-tcs.com}"
CANDIDATE_STARTED="${5:-auto}"

cd "$DEPLOY_ROOT"

git cat-file -e "${PREVIOUS_SHA}^{commit}" 2>/dev/null || {
  echo "ERROR: ancien SHA introuvable: $PREVIOUS_SHA" >&2
  exit 1
}

CURRENT_MARKER="$(
  curl --fail --silent --max-time 5 \
    "http://127.0.0.1:8080/deployment-version.json?rollback-detect=${PREVIOUS_SHA}" \
    2>/dev/null || true
)"

if [ "$CANDIDATE_STARTED" = auto ]; then
  if printf '%s' "$CURRENT_MARKER" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""; then
    CANDIDATE_STARTED=false
  else
    CANDIDATE_STARTED=true
  fi
fi

case "$CANDIDATE_STARTED" in
  true|false) ;;
  *)
    echo "ERROR: candidate-started doit valoir true, false ou auto." >&2
    exit 1
    ;;
esac

echo "Rollback automatique vers ${PREVIOUS_SHA} (candidate-started=${CANDIDATE_STARTED})."

if [ "$CANDIDATE_STARTED" = true ]; then
  # Avant de restaurer, diagnostique si le candidat était bien routé publiquement
  # et si le seul défaut est la terminaison TLS amont.
  CURRENT_COMMIT="$(printf '%s' "$CURRENT_MARKER" | sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ -n "$CURRENT_COMMIT" ]; then
    CANDIDATE_PUBLIC="$(
      curl --insecure --fail --silent --show-error --location \
        --connect-timeout 5 --max-time 15 \
        -H 'Cache-Control: no-cache' \
        "https://${PPD_DOMAIN}/deployment-version.json?rollback-diagnose=${CURRENT_COMMIT}" \
        2>/dev/null || true
    )"
    if printf '%s' "$CANDIDATE_PUBLIC" | grep -Fq "\"commit\": \"${CURRENT_COMMIT}\""; then
      echo "::warning::Le candidat ${CURRENT_COMMIT} était correctement routé publiquement ; l'échec provient du certificat TLS amont."
    fi
  fi

  test -s "$BACKUP_FILE" || {
    echo "ERROR: dump de rollback absent: $BACKUP_FILE" >&2
    exit 1
  }

  # La nouvelle pile a pu exécuter des migrations : on remet la base exactement
  # dans l'état du dump créé avant la bascule puis on reconstruit l'ancien SHA.
  docker compose --env-file .env.production -f docker-compose.prod.yml stop frontend backend || true
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d db

  DB_READY=false
  for attempt in $(seq 1 30); do
    if docker exec climbcrew-db sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      DB_READY=true
      break
    fi
    sleep 1
  done
  [ "$DB_READY" = true ] || {
    echo "ERROR: PostgreSQL indisponible pendant le rollback." >&2
    exit 1
  }

  docker exec -i climbcrew-db pg_restore --list < "$BACKUP_FILE" >/dev/null
  docker exec climbcrew-db sh -lc '
    set -eu
    dropdb --if-exists --force --maintenance-db=postgres -U "$POSTGRES_USER" "$POSTGRES_DB"
    createdb --maintenance-db=postgres -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"
  '
  docker exec -i climbcrew-db sh -lc '
    exec pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  ' < "$BACKUP_FILE"

  git checkout -B main "$PREVIOUS_SHA"
  export GITHUB_SHA="$PREVIOUS_SHA"
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
else
  # L'échec est survenu avant le démarrage du candidat : les conteneurs et la
  # base servent encore l'ancienne version. On ne touche donc ni aux données ni
  # aux processus ; seul le clone persistant revient sur l'ancien SHA.
  git checkout -B main "$PREVIOUS_SHA"
  echo "Candidat jamais démarré : PostgreSQL et conteneurs laissés intacts."
fi

BACKEND_OK=false
for attempt in $(seq 1 24); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3000/health >/dev/null; then
    BACKEND_OK=true
    break
  fi
  sleep 5
done
[ "$BACKEND_OK" = true ] || {
  docker logs --tail 200 climbcrew-backend || true
  echo "ERROR: backend non sain après rollback." >&2
  exit 1
}

FRONTEND_OK=false
for attempt in $(seq 1 12); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:8080/ >/dev/null; then
    FRONTEND_OK=true
    break
  fi
  sleep 5
done
[ "$FRONTEND_OK" = true ] || {
  echo "ERROR: frontend non sain après rollback." >&2
  exit 1
}

PREVIOUS_VERSION="$(tr -d '[:space:]' < VERSION)"
LOCAL_MARKER="$(
  curl --fail --silent --max-time 10 \
    "http://127.0.0.1:8080/deployment-version.json?rollback=${PREVIOUS_SHA}"
)"
printf '%s' "$LOCAL_MARKER" | grep -Fq "\"version\": \"${PREVIOUS_VERSION}\""
printf '%s' "$LOCAL_MARKER" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""

# Le rollback garantit l'état applicatif local. Le frontal public pouvait déjà
# être dégradé avant la tentative ; ses contrôles restent informatifs.
PROXY_MARKER="$(
  curl --fail --silent --show-error --max-time 10 \
    -H "Host: ${PPD_DOMAIN}" \
    "http://127.0.0.1/deployment-version.json?rollback=${PREVIOUS_SHA}" \
    2>/dev/null || true
)"
if printf '%s' "$PROXY_MARKER" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""; then
  echo "Routage Nginx local restauré."
else
  echo "::warning::Le routage Nginx PPD n'était pas vérifiable après rollback ; état applicatif local restauré."
fi

STRICT_PUBLIC="$(
  curl --fail --silent --show-error --location \
    --connect-timeout 5 --max-time 15 \
    -H 'Cache-Control: no-cache' \
    "https://${PPD_DOMAIN}/deployment-version.json?rollback=${PREVIOUS_SHA}" \
    2>/dev/null || true
)"
if printf '%s' "$STRICT_PUBLIC" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""; then
  echo "Frontal public restauré avec TLS valide."
else
  INSECURE_PUBLIC="$(
    curl --insecure --fail --silent --show-error --location \
      --connect-timeout 5 --max-time 15 \
      -H 'Cache-Control: no-cache' \
      "https://${PPD_DOMAIN}/deployment-version.json?rollback=${PREVIOUS_SHA}" \
      2>/dev/null || true
  )"
  if printf '%s' "$INSECURE_PUBLIC" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""; then
    echo "::warning::Frontal public restauré, mais le certificat TLS amont ne valide pas ${PPD_DOMAIN}."
  else
    echo "::warning::Frontal public non vérifiable après rollback ; l'état local précédent est sain."
  fi
fi

echo "Rollback terminé : version ${PREVIOUS_VERSION}, SHA ${PREVIOUS_SHA}."
