<p align="center"><img src="docs/banner.svg" alt="Portfolio Tracker" width="100%"></p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-8B5CF6?style=for-the-badge&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-22D3EE?style=for-the-badge&logo=typescript&logoColor=08323A">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/Postgres_16-FF4DA6?style=for-the-badge&logo=postgresql&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-B6F36B?style=for-the-badge&logo=docker&logoColor=08323A">
</p>

> **Your money, your numbers, no noise.** What it is worth, what it has earned, and whether your income can carry the life you want. Built for a handful of people on one small always-on machine, with no hosting bill.
>
> **Sign in with Google, or try the demo in one click.** Passkeys are optional. There are no passwords.

## What you get

| | |
|---|---|
| 📈 **Two honest numbers** | *Total value* and *Total profit*, plus one plain sentence on what drove the profit, before and after inflation. |
| 🧾 **A ledger you can trust** | A buy counts as money you put in, a sale adds to cash, and `value - money put in = profit` always holds. Edit or delete any transaction and the whole ledger is re-checked. |
| 🕰️ **Real history only** | A daily snapshot draws the value line. Nothing is replayed or guessed, so a period shows up only once there is data behind it. |
| 🏠 **Life context** | Homes, income, bills read from PDFs, a "second salary" target, and where you stand against public statistics (Eurostat, World Bank, INDEC). |
| 🌎 **EN + es-AR** | One glossary, enforced by a test. |

## How it fits together

```mermaid
flowchart LR
  U([You]) --> W["React app<br/>(nginx)"]
  W -- "/api" --> A["Express API"]
  A --> D[("PostgreSQL 16")]
  A -. prices .-> Y["Yahoo Finance"]
  A -. rates + stats .-> E["ECB / Eurostat / World Bank"]
  A -. verify .-> H["hCaptcha + Google"]
  classDef hot fill:#8B5CF6,stroke:#8B5CF6,color:#fff
  classDef pink fill:#FF4DA6,stroke:#FF4DA6,color:#fff
  classDef cyan fill:#22D3EE,stroke:#22D3EE,color:#08323A
  class W hot
  class A pink
  class D cyan
```

Inside the API the code is hexagonal, and the rule is simple: the closer to the middle, the less it knows about the outside world.

```mermaid
flowchart TB
  R["routes<br/>parse HTTP with Zod"] --> S["application<br/>orchestrates through ports"]
  S --> M["domain<br/>pure maths, no clock, no network, no DB"]
  S -. ports .-> I["infrastructure<br/>Prisma, Yahoo, FX, statistics, hCaptcha"]
  classDef core fill:#B6F36B,stroke:#B6F36B,color:#08323A
  class M core
```

Swapping a vendor or the storage means changing one adapter. Financial maths is written test-first. Schemas live once in `apps/api/src/contracts` and are mirrored to the web (`npm run contracts:check`).

## Security and privacy

```mermaid
sequenceDiagram
  participant You
  participant App
  participant API
  You->>App: tick the human check
  App->>API: Google token + hCaptcha token
  API->>API: rate limit, then hCaptcha, then Google
  API-->>App: session (30 days)
```

- 🤖 **Human check (hCaptcha)** before Google sign-in and the demo, verified on the server. It fails closed and stays off unless both keys are set.
- 🔑 **No passwords.** Google tokens are checked against this app's client id; accounts are found by an HMAC of the email, never the email itself. Passkeys are optional.
- 🔒 **Encrypted profile.** Income, homes, bills and goals are encrypted per field. Transactions and snapshots follow in the next phase.
- 🧪 **Throwaway demo.** Every visitor gets a separate account, erased on sign-out and after an hour.
- 🛡️ **Hardened production.** Non-root read-only containers, a database with no route to the internet, strict CSP, rate-limited sign-in, and age-encrypted daily backups with a tested restore.

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
