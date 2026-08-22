#!/usr/bin/env bash
set -euo pipefail

VERSION_FILE="frontend/src/lib/version.js"
VERSION_PATTERN='^[0-9]{8}\.[0-9]{3}$'
BASE_REF="${BASE_REF:-}"
BEFORE_SHA="${BEFORE_SHA:-}"

extract_version_from_file() {
  sed -n 's/.*APP_VERSION = configuredVersion || "\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' "$1" | head -n 1
}

extract_version_from_ref() {
  local ref="$1"
  git show "${ref}:${VERSION_FILE}" \
    | sed -n 's/.*APP_VERSION = configuredVersion || "\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' \
    | head -n 1
}

CURRENT_VERSION="$(extract_version_from_file "$VERSION_FILE")"
if [[ ! "$CURRENT_VERSION" =~ $VERSION_PATTERN ]]; then
  echo "ERROR: version courante absente ou invalide : '$CURRENT_VERSION'"
  echo "Format attendu : AAAAMMJJ.NNN."
  exit 1
fi

BASE_VERSION=""
BASE_LABEL=""

if [ -n "$BASE_REF" ]; then
  git fetch --no-tags --depth=1 origin \
    "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"
  BASE_LABEL="origin/${BASE_REF}"
  BASE_VERSION="$(extract_version_from_ref "refs/remotes/origin/${BASE_REF}")"
elif [ -n "$BEFORE_SHA" ] && [[ ! "$BEFORE_SHA" =~ ^0+$ ]]; then
  if ! git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null; then
    git fetch --no-tags --depth=1 origin "$BEFORE_SHA"
  fi
  BASE_LABEL="$BEFORE_SHA"
  BASE_VERSION="$(extract_version_from_ref "$BEFORE_SHA")"
elif git rev-parse HEAD^ >/dev/null 2>&1; then
  BASE_LABEL="HEAD^"
  BASE_VERSION="$(extract_version_from_ref HEAD^)"
fi

if [ -z "$BASE_VERSION" ]; then
  echo "Version courante valide : $CURRENT_VERSION"
  echo "Aucune version de référence disponible ; comparaison ignorée."
  exit 0
fi

if [[ ! "$BASE_VERSION" =~ $VERSION_PATTERN ]]; then
  echo "ERROR: version de référence invalide sur ${BASE_LABEL} : '$BASE_VERSION'"
  exit 1
fi

echo "Version de référence : $BASE_VERSION (${BASE_LABEL})"
echo "Version proposée     : $CURRENT_VERSION"

if [[ "$CURRENT_VERSION" == "$BASE_VERSION" || "$CURRENT_VERSION" < "$BASE_VERSION" ]]; then
  echo "ERROR: toute évolution doit incrémenter frontend/src/lib/version.js."
  echo "La version proposée doit être strictement supérieure à $BASE_VERSION."
  exit 1
fi

echo "Version correctement incrémentée : $BASE_VERSION -> $CURRENT_VERSION"
