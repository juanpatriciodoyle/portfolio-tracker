# Portfolio Tracker

A calm, private place to see everything you own: what it is worth, what it has earned, and whether your income can carry the life you want. Built for a handful of people on one small always-on machine, with no hosting bill.

**Sign in with Google, or try the demo in one click.** Passkeys (Touch ID, Face ID) are an optional extra. There are no passwords.

## What it does

- **Two honest figures on Home**: *Total value* and *Total profit*, with one plain sentence on what drove the profit, before and after inflation.
- **A ledger you can trust**: one money model (a buy counts as money you put in, a sale adds to cash), `net worth - money put in = profit` always holds, and every transaction can be edited or deleted with the whole ledger re-checked.
- **Real history only**: a daily snapshot builds the value-over-time line. Nothing is replayed or estimated, so periods appear only once there is data behind them.
- **Life context, not just prices**: homes lived in, income, bills (read from PDFs), a "second salary" target, and where you stand against public statistics for your country (Eurostat, World Bank, INDEC).
- **English and Argentine Spanish**, with one glossary enforced by a test.

## How it is built

| | |
|---|---|
| `apps/web` | React, TypeScript, Vite. No state library, no UI kit: tokens in CSS, pure logic in `lib/`. |
| `apps/api` | Express, TypeScript, Prisma, PostgreSQL 16. |
| Contracts | Zod schemas written once in `apps/api/src/contracts`, mirrored to the web (`npm run contracts:check`). |

The API is hexagonal: `domain/` is pure (no clock, no network, no database), `application/` orchestrates through ports, `infrastructure/` holds the Prisma, Yahoo Finance, FX and statistics adapters. Swapping a vendor or the storage means changing one adapter. Financial maths is written test-first.

## Security and privacy

- Google tokens are verified server-side against this app's client id; accounts are found by an HMAC of the email, never the email itself.
- Profile data (income, homes, bills, goals) is encrypted per field. Encrypting transactions and snapshots the same way is the next phase.
- The demo gives every visitor a separate, throwaway account, erased on sign-out and after an hour.
- Production: non-root read-only containers, a database with no route to the internet, strict CSP headers, rate-limited sign-in, and age-encrypted daily backups with a tested restore.

## Run it

```bash
cp apps/api/.env.example apps/api/.env      # fill in the values; see the comments
(cd apps/api && npm install && npx prisma generate && npx prisma migrate deploy)
(cd apps/web && npm install)
./dev.sh                                    # Postgres + API :3000 + web :5173
```

Tests are hermetic (no network, no database): `npm test` inside `apps/api` or `apps/web`. `npm run test:integration` in `apps/api` uses a disposable Postgres.

## Deploy

`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build` runs the whole stack (web on nginx, API, database, one-shot migrations, backups). Designed for a Raspberry Pi 4/5 behind a tunnel such as Tailscale Funnel. Updates are `git pull` and the same command; data stays in its volume.

Everything else (rules, endpoints, vocabulary, decisions) lives in [CLAUDE.md](CLAUDE.md).
