#!/usr/bin/env bash
# Backup + restore drill: takes a fresh encrypted backup, restores it into a
# scratch database, compares row counts of every table with the live database,
# then drops the scratch database. Exit code 0 only if every count matches.
#
#   BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/restore-drill.sh [backup-dir]
#
# Counts are taken right after the backup; run it when writes are quiet, or
# expect small differences in busy tables (sessions, audit_logs, outbox_events).
set -euo pipefail

OUT_DIR="${1:-./backups}"
COMPOSE="${COMPOSE:-docker compose}"
HERE="$(cd "$(dirname "$0")" && pwd)"

counts() {
  $COMPOSE exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d '$1' -At -F ' ' -c \"
    SELECT format('%s %s', table_name,
      (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text)
      FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name\""
}

LIVE_DB="$($COMPOSE exec -T postgres sh -c 'printf %s "$POSTGRES_DB"')"
"$HERE/backup.sh" "$OUT_DIR"
LIVE="$(counts "$LIVE_DB")"
FILE="$(ls -1t "$OUT_DIR"/bcp-*.dump.gpg | head -1)"
SCRATCH="bcp_drill_$(date -u +%Y%m%d%H%M%S)"
trap '$COMPOSE exec -T postgres sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $SCRATCH" >/dev/null' EXIT

( cd "$OUT_DIR" && sha256sum -c "$(basename "$FILE").sha256" )
"$HERE/restore.sh" "$FILE" "$SCRATCH" >/dev/null
RESTORED="$(counts "$SCRATCH")"

if [ "$LIVE" = "$RESTORED" ]; then
  echo "restore drill OK: $(echo "$LIVE" | wc -l) tables, $(echo "$LIVE" | awk '{s+=$2} END {print s}') rows match ($FILE)"
else
  echo "restore drill FAILED: row counts differ (live < > restored)" >&2
  diff <(echo "$LIVE") <(echo "$RESTORED") >&2 || true
  exit 1
fi
