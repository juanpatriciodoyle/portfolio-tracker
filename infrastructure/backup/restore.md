# Backups: how they work, how to restore

## What is kept
Once a day the `backup` container dumps the database, encrypts the dump to a **public** `age` key, and writes
`backups/portfolio-<UTC time>.dump.age` next to the compose file. The newest 14 stay. The plain dump exists only in
memory. The machine holds only the public key: anyone who steals the backups, or the machine, cannot read them.

## One-time setup (on a different computer, not the server)
```sh
age-keygen -o age.key          # prints: Public key: age1....
```
- Put the **public** key (`age1...`) in `.env.production` as `BACKUP_AGE_PUBLIC_KEY`.
- Keep `age.key` (the private half) in a password manager **and** printed in a safe place. Without it the backups are worthless.
- Copy `backups/` somewhere else too (another computer, an external disk, a cloud drive): a backup on the same disk
  only protects against mistakes, not against the disk dying. Because the files are encrypted, any storage will do.

## Take a backup now
```sh
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm -e BACKUP_RUN_ONCE=1 backup
```

## Restore (into an empty database)
1. Make an empty database owned by the app's role:
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
     psql -U postgres_admin -d postgres -c 'CREATE DATABASE portfolio_restore OWNER portfolio_app'
   ```
2. Restore, giving the private key on standard input (so it is never saved on the server):
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm -T --no-deps --entrypoint sh backup \
     -c 'cat > /tmp/age.key && /usr/local/bin/restore.sh /backups/portfolio-YYYYMMDDTHHMMSSZ.dump.age /tmp/age.key \
         "postgresql://portfolio_app:<APP_DB_PASSWORD>@db:5432/portfolio_restore"' < /path/to/age.key
   ```
   It refuses a database that already has tables (exit 3) and a wrong key (exit 1).
3. Check it (`psql ... -d portfolio_restore`), then switch the API over: stop the stack, change `APP_DB_NAME` /
   the connection to the restored database, or rename it (`ALTER DATABASE portfolio RENAME TO portfolio_old` then
   `ALTER DATABASE portfolio_restore RENAME TO portfolio`) while the API is stopped, and start it again.

## Copying backups off the machine (optional, off by default)
`BACKUP_AFTER_HOOK` may name an executable inside the backup container; it is called with the path of each new file.
For example, with a `rclone` config for a storage you choose, mount a script that runs `rclone copy "$1" remote:portfolio-backups`.
Nothing is sent anywhere unless you set it up.

## Practise it
A backup you have never restored is a hope. Restore into `portfolio_restore` once now, and again after any change to this setup.
