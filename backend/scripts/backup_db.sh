#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-companyaudit-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-companyaudit}"
DB_NAME="${1:-${POSTGRES_DB:-companyaudit}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${SCRIPT_DIR}/../backups}"

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${OUTPUT_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
SHA_FILE="${DUMP_FILE}.sha256"

if command -v pg_dump >/dev/null 2>&1 && [[ "${USE_DOCKER_EXEC:-false}" != "true" ]]; then
  echo "Running local pg_dump against ${DB_HOST}:${DB_PORT}/${DB_NAME}..."
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-privileges -f "$DUMP_FILE"
else
  echo "Running pg_dump inside Docker container '${CONTAINER_NAME}'..."
  docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-privileges > "$DUMP_FILE"
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$(basename "$DUMP_FILE")" > "$(basename "$SHA_FILE")")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$DUMP_FILE")" > "$(basename "$SHA_FILE")")
fi

echo "Backup created: ${DUMP_FILE}"
echo "Checksum file: ${SHA_FILE}"

