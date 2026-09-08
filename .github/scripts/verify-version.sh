#!/usr/bin/env bash
set -euo pipefail

VERSION_FILE="VERSION"
LEGACY_FRONTEND_VERSION_FILE="frontend/src/lib/version.js"
CURRENT_VERSION_PATTERN='^[0-9]{6}\.[0-9]{3}$'
REFERENCE_VERSION_PATTERN='^([0-9]{6}|[0-9]{8})\.[0-9]{3}$'
BASE_REF="${BASE_REF:-}"
BEFORE_SHA="${BEFORE_SHA:-}"
VERSION_CONSISTENCY_ONLY="${VERSION_CONSISTENCY_ONLY:-0}"

extract_canonical_version() {
  tr -d '[:space:]' < "$1"
}

extract_version_from_ref() {
  local ref="$1"
  git show "${ref}:${VERSION_FILE}" 2>/dev/null | tr -d '[:space:]'
}

version_compare_key() {
  local version="$1"
  local date_part="${version%%.*}"
  local sequence_part="${version##*.}"

  # Compatibilité de transition : les versions historiques AAAAMMJJ.NNN sont
  # comparées à leur équivalent AAMMJJ.NNN sans modifier l'historique Git.
  if [ "${#date_part}" -eq 8 ]; then
    date_part="${date_part:2:6}"
  fi

  printf '%s%s\n' "$date_part" "$sequence_part"
}

infra_only_change() {
  local diff_base=""
  local changed_files=""

  if [ -n "$BASE_REF" ]; then
    git fetch --no-tags --depth=1 origin \
      "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"
    diff_base="refs/remotes/origin/${BASE_REF}"
    changed_files="$(git diff --name-only "${diff_base}...HEAD")"
  elif [ -n "$BEFORE_SHA" ] && [[ ! "$BEFORE_SHA" =~ ^0+$ ]]; then
    if ! git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null; then
      git fetch --no-tags --depth=1 origin "$BEFORE_SHA"
    fi
    diff_base="$BEFORE_SHA"
    changed_files="$(git diff --name-only "${diff_base}..HEAD")"
  else
    return 1
  fi

  [ -n "$changed_files" ] || return 1

  while IFS= read -r path; do
    case "$path" in
      .github/*) ;;
      *) return 1 ;;
    esac
  done <<< "$changed_files"

  echo "Modification d'infrastructure uniquement ; VERSION applicative inchangée autorisée."
  printf '%s\n' "$changed_files"
  return 0
}

CURRENT_VERSION="$(extract_canonical_version "$VERSION_FILE")"

if [[ ! "$CURRENT_VERSION" =~ $CURRENT_VERSION_PATTERN ]]; then
  echo "ERROR: VERSION absente ou invalide : '$CURRENT_VERSION'"
  echo "Format attendu : AAMMJJ.NNN."
  exit 1
fi

echo "Version canonique valide : $CURRENT_VERSION"
if [ "$VERSION_CONSISTENCY_ONLY" = "1" ]; then
  exit 0
fi

if infra_only_change; then
  exit 0
fi

BASE_VERSION=""
BASE_LABEL=""

if [ -n "$BASE_REF" ]; then
  git fetch --no-tags --depth=1 origin \
    "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"
  BASE_LABEL="origin/${BASE_REF}"
  BASE_VERSION="$(extract_version_from_ref "refs/remotes/origin/${BASE_REF}" || true)"
elif [ -n "$BEFORE_SHA" ] && [[ ! "$BEFORE_SHA" =~ ^0+$ ]]; then
  if ! git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null; then
    git fetch --no-tags --depth=1 origin "$BEFORE_SHA"
  fi
  BASE_LABEL="$BEFORE_SHA"
  BASE_VERSION="$(extract_version_from_ref "$BEFORE_SHA" || true)"
elif git rev-parse HEAD^ >/dev/null 2>&1; then
  BASE_LABEL="HEAD^"
  BASE_VERSION="$(extract_version_from_ref HEAD^ || true)"
fi

# Transition : les anciennes révisions peuvent ne pas encore avoir VERSION.
# Dans ce cas uniquement, on récupère leur ancien fallback frontend pour comparer
# l'incrément. La révision courante n'a plus aucun doublon de version.
if [ -z "$BASE_VERSION" ] && [ -n "$BASE_LABEL" ]; then
  BASE_VERSION="$(git show "${BASE_LABEL}:${LEGACY_FRONTEND_VERSION_FILE}" 2>/dev/null \
    | sed -n 's/.*APP_VERSION = configuredVersion || "\([0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' \
    | head -n 1 || true)"
fi

if [ -z "$BASE_VERSION" ]; then
  echo "Aucune version de référence disponible ; comparaison ignorée."
  exit 0
fi

if [[ ! "$BASE_VERSION" =~ $REFERENCE_VERSION_PATTERN ]]; then
  echo "ERROR: version de référence invalide sur ${BASE_LABEL} : '$BASE_VERSION'"
  exit 1
fi

echo "Version de référence : $BASE_VERSION (${BASE_LABEL})"
echo "Version proposée     : $CURRENT_VERSION"

CURRENT_KEY="$(version_compare_key "$CURRENT_VERSION")"
BASE_KEY="$(version_compare_key "$BASE_VERSION")"

if [[ "$CURRENT_KEY" == "$BASE_KEY" || "$CURRENT_KEY" < "$BASE_KEY" ]]; then
  echo "ERROR: toute évolution applicative doit incrémenter VERSION."
  echo "La version proposée doit être strictement supérieure à $BASE_VERSION."
  exit 1
fi

echo "Version correctement incrémentée : $BASE_VERSION -> $CURRENT_VERSION"
