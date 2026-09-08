#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${1:?Usage: rollback-preprod.sh <deploy-root> <previous-sha> <backup-file> [ppd-domain]}"
PREVIOUS_SHA="${2:?SHA précédent requis}"
BACKUP_FILE="${3:?Dump PostgreSQL requis}"
PPD_DOMAIN="${4:-pre-climbcrew.dip-tcs.com}"

cd "$DEPLOY_ROOT"

test -s "$BACKUP_FILE" || {
  echo "ERROR: dump de rollback absent: $BACKUP_FILE" >&2
  exit 1
}
git cat-file -e "${PREVIOUS_SHA}^{commit}" 2>/dev/null || {
  echo "ERROR: ancien SHA introuvable: $PREVIOUS_SHA" >&2
  exit 1
}

echo "Rollback automatique vers ${PREVIOUS_SHA}."

# Arrête les processus applicatifs avant de remettre la base exactement dans
# l'état du dump pré-déploiement. PostgreSQL reste disponible localement.
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

PUBLIC_MARKER="$(
  curl --fail --silent --show-error --location \
    --connect-timeout 5 --max-time 15 \
    -H 'Cache-Control: no-cache' \
    "https://${PPD_DOMAIN}/deployment-version.json?rollback=${PREVIOUS_SHA}"
)"
printf '%s' "$PUBLIC_MARKER" | grep -Fq "\"version\": \"${PREVIOUS_VERSION}\""
printf '%s' "$PUBLIC_MARKER" | grep -Fq "\"commit\": \"${PREVIOUS_SHA}\""

echo "Rollback terminé : version ${PREVIOUS_VERSION}, SHA ${PREVIOUS_SHA}."
