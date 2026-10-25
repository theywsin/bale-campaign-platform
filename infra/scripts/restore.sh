#!/usr/bin/env bash
# Restores an encrypted backup produced by backup.sh.
#
#   BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/restore.sh backups/bcp-<stamp>.dump.gpg [target-db]
#
# By default it restores into a NEW database (bcp_restore_<stamp>) so the live
# database is untouched; verify it, then switch over deliberately (see
# BACKUP_RESTORE.md). Pass the live database name as target-db only during a
# planned recovery with the api/worker/scheduler stopped.
set -euo pipefail

FILE="${1:?usage: restore.sh <backup.dump.gpg> [target-db]}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
COMPOSE="${COMPOSE:-docker compose}"
STAMP="$(basename "$FILE" | sed -E 's/^bcp-([0-9TZ]+)\.dump\.gpg$/\1/' | tr 'A-Z' 'a-z')"
TARGET_DB="${2:-bcp_restore_${STAMP}}"

if [ -f "$FILE.sha256" ]; then
  ( cd "$(dirname "$FILE")" && sha256sum --check --quiet "$(basename "$FILE").sha256" ) || { echo "checksum mismatch" >&2; exit 1; }
fi

echo "restoring $FILE into database '$TARGET_DB'"
$COMPOSE exec -T postgres sh -c "createdb -U \"\$POSTGRES_USER\" '$TARGET_DB' 2>/dev/null || true"
gpg --batch --quiet --decrypt --passphrase-file "$PASS_FILE" "$FILE" \
  | $COMPOSE exec -T postgres sh -c "pg_restore --clean --if-exists --no-owner --exit-on-error -U \"\$POSTGRES_USER\" -d '$TARGET_DB'"
echo "restore finished. Verify with:"
echo "  $COMPOSE exec postgres psql -U \"\$POSTGRES_USER\" -d $TARGET_DB -c 'SELECT count(*) FROM users;'"
