#!/bin/sh
# Restores one encrypted backup into an EMPTY database.
#   restore.sh <backup.dump.age> <age-private-key-file> <postgresql://user:password@host/database>
# The private key is given by whoever restores; it is never kept on the server. The plain dump exists only in a
# private temporary folder, deleted when this ends.
set -eu

[ "$#" -eq 3 ] || { echo "usage: restore.sh <backup.dump.age> <age-private-key-file> <target-database-url>" >&2; exit 2; }
BACKUP="$1"; KEY="$2"; TARGET="$3"

[ -r "$BACKUP" ] || { echo "cannot read $BACKUP" >&2; exit 2; }
[ -r "$KEY" ] || { echo "cannot read the private key $KEY" >&2; exit 2; }

tables="$(psql "$TARGET" -tA -c "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ] && [ "${RESTORE_ALLOW_NON_EMPTY:-0}" != "1" ]; then
  echo "the target database already has $tables tables: restore into a fresh one (or set RESTORE_ALLOW_NON_EMPTY=1)" >&2
  exit 3
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"

age --decrypt --identity "$KEY" --output "$work/dump" "$BACKUP"
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$TARGET" "$work/dump"
echo "restored $(basename "$BACKUP")"
