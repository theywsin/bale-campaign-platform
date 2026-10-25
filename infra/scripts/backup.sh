#!/usr/bin/env bash
# Encrypted PostgreSQL backup for the docker compose stack.
#
#   BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/backup.sh [output-dir]
#
# Produces <output-dir>/bcp-<UTC timestamp>.dump.gpg (pg_dump custom format,
# encrypted with GnuPG AES256) and a .sha256 checksum. The passphrase file must
# live outside the repository and outside the backup destination.
set -euo pipefail

OUT_DIR="${1:-./backups}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE to a file containing the encryption passphrase}"
COMPOSE="${COMPOSE:-docker compose}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

[ -s "$PASS_FILE" ] || { echo "passphrase file is empty or missing: $PASS_FILE" >&2; exit 1; }
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/bcp-$STAMP.dump.gpg"
TMP="$TARGET.partial"
trap 'rm -f "$TMP"' EXIT

# Credentials are read inside the container from its own environment.
$COMPOSE exec -T postgres sh -c 'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$PASS_FILE" --output "$TMP"

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"
( cd "$OUT_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256" )
echo "backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"

# Retention: delete encrypted dumps older than RETENTION_DAYS.
find "$OUT_DIR" -maxdepth 1 -name 'bcp-*.dump.gpg*' -type f -mtime +"$RETENTION_DAYS" -print -delete
