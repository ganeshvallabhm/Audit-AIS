#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-dump-file> [target-db-name]"
  exit 1
fi

DUMP_FILE="$1"
DB_NAME="${2:-${POSTGRES_DB:-companyaudit}}"
CONTAINER_NAME="${CONTAINER_NAME:-companyaudit-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-companyaudit}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Error: Backup file not found: $DUMP_FILE" >&2
  exit 1
fi

SHA_FILE="${DUMP_FILE}.sha256"
if [[ -f "$SHA_FILE" ]]; then
  DUMP_DIR="$(cd "$(dirname "$DUMP_FILE")" && pwd)"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$DUMP_DIR" && sha256sum -c "$(basename "$SHA_FILE")")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$DUMP_DIR" && shasum -a 256 -c "$(basename "$SHA_FILE")")
  fi
fi

if [[ "${FORCE_RESTORE:-false}" != "true" ]]; then
  read -r -p "WARNING: Overwrite database '${DB_NAME}' with '${DUMP_FILE}'? Type RESTORE: " REPLY
  if [[ "$REPLY" != "RESTORE" ]]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

if command -v pg_restore >/dev/null 2>&1 && [[ "${USE_DOCKER_EXEC:-false}" != "true" ]]; then
  echo "Restoring via local pg_restore into ${DB_HOST}:${DB_PORT}/${DB_NAME}..."
  pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges "$DUMP_FILE"
else
  echo "Restoring via Docker container '${CONTAINER_NAME}' into '${DB_NAME}'..."
  docker exec -i "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges < "$DUMP_FILE"
fi

echo "Restore complete for database '${DB_NAME}'."

