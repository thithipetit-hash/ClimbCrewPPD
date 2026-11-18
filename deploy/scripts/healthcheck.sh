#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${PUBLIC_URL:-https://climbcrew.dip-tcs.com}"

check_health() {
  local label="$1"
  local url="$2"
  local response
  echo "$label : $url"
  response="$(curl -fsS "$url")"
  echo "$response"
  if grep -Eq '"degraded"[[:space:]]*:[[:space:]]*true' <<<"$response"; then
    echo "ClimbCrew est démarré mais un scheduler est en état dégradé." >&2
    return 1
  fi
}

check_health "Test public" "${BASE_URL%/}/api/health"
check_health "Test local backend" "http://127.0.0.1:${BACKEND_BIND_PORT:-3000}/health"
