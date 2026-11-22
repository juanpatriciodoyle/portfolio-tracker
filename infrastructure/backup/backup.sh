#!/bin/sh
# Dumps the database, encrypts the dump to the public key in BACKUP_AGE_PUBLIC_KEY, keeps the newest BACKUP_KEEP files.
# The plain dump exists only in /tmp (memory), never on the disk. BACKUP_RUN_ONCE=1 makes one backup and exits.
set -eu

: "${BACKUP_AGE_PUBLIC_KEY:?BACKUP_AGE_PUBLIC_KEY is not set}"
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-14}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"

log() { printf '{"time":"%s","level":"%s","event":"%s"%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${3:+,$3}"; }

run_backup() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  final="$DIR/portfolio-$stamp.dump.age"
  partial="$final.partial"
  plain="$(mktemp /tmp/dump.XXXXXX)"
  trap 'rm -f "$plain" "$partial"' EXIT

  pg_dump --format=custom --no-owner --no-privileges --file="$plain"
  age --recipient "$BACKUP_AGE_PUBLIC_KEY" --output "$partial" "$plain"
  rm -f "$plain"

  [ -s "$partial" ] && head -c 22 "$partial" | grep -q "age-encryption.org" || { log error backup_not_encrypted; return 1; }
  mv "$partial" "$final"
  trap - EXIT
  log info backup_written "\"file\":\"$(basename "$final")\",\"bytes\":$(wc -c < "$final")"

  # Oldest first goes: only the newest $KEEP stay.
  ls -1t "$DIR"/portfolio-*.dump.age 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" && log info backup_pruned "\"file\":\"$(basename "$old")\""
  done

  # Optional: copy the new file somewhere else (see infrastructure/backup/restore.md). Off unless the variable is set.
  if [ -n "${BACKUP_AFTER_HOOK:-}" ] && [ -x "$BACKUP_AFTER_HOOK" ]; then "$BACKUP_AFTER_HOOK" "$final" || log warn backup_hook_failed; fi
}

if [ "${BACKUP_RUN_ONCE:-0}" = "1" ]; then run_backup; exit $?; fi

sleep "${BACKUP_FIRST_DELAY_SECONDS:-120}"
while true; do
  run_backup || log error backup_failed
  sleep "$((INTERVAL_HOURS * 3600))"
done
