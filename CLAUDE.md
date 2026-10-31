# CLAUDE.md

## Project Overview
This repository contains a broker-agnostic financial intelligence layer designed to track investments, enforce behavioral discipline, and optimize returns for an active investor[cite: 1, 8]. The platform is tailored for an investor in their 30s based in Madrid (with planned travel across Europe and eventual relocation to Argentina), holding investments across XTB, bank accounts, and cash[cite: 1, 8].

### Core Philosophy & Product Principles
- **Radical Simplicity & UI Purity:** Prioritize progressive disclosure, zero visual clutter, and ambient data visualization[cite: 1, 8]. Avoid complicated financial jargon and dense chart cemeteries; ensure the interface is intuitive enough for anyone to understand at a glance[cite: 3, 10].
- **Broker Agnosticism (The Universal Ledger):** The platform is execution-agnostic, acting as the single source of truth by ingesting and normalizing data across any broker, bank, or institution[cite: 1, 8].
- **Behavioral Accountability:** Track investor discipline rather than raw luck by auditing user-defined rules and execution habits[cite: 1, 8].
- **Contextual Intelligence:** Correlate financial outcomes with personal life events, geographical mobility, and daily execution routines[cite: 2, 9].
- **Zero-Latency Performance:** Optimized for continuous daily peripheral monitoring with true-black contrast for OLED displays and instant rendering[cite: 2, 9].

---

## Monorepo Architecture & Technology Stack

The project is structured as a three-tier modular monolith monorepo[cite: 5, 6, 10]:
- **Frontend (`apps/web`):** React SPA built with TypeScript, Tailwind CSS, and Vite, running locally on port `5173`[cite: 6, 10]. Vite's internal development proxy routes all `/api` requests to port `3000` to eliminate CORS overhead[cite: 6, 10].
- **Backend (`apps/api`):** Express REST API in TypeScript executed with `tsx` on port `3000`[cite: 6, 10]. Handles JWT authentication, WebAuthn passkeys, financial engines, and Server-Sent Events (SSE)[cite: 3, 6, 10].
- **Data Layer:** PostgreSQL 16 running in a Docker container on port `5432`, hosted inside a Colima Linux virtual machine on macOS[cite: 6, 11]. Prisma ORM manages schemas, migrations, queries, and seeding[cite: 6].

---

## Environment & Development Commands

### Starting the Local Environment
Execute commands in this specific sequence[cite: 6, 11]:
1. `colima start` — Boots the background Linux VM providing the Docker daemon on macOS[cite: 6, 11].
2. `docker compose up -d` (from repository root) — Spawns the PostgreSQL 16 container on port `5432`[cite: 6, 11].
3. `npm run dev` (inside `apps/api`) — Boots the Express API server on port `3000`, establishes Prisma connections, and runs seeding if needed[cite: 6, 11].
4. `npm run dev` (inside `apps/web`) — Starts the Vite frontend dev server on port `5173` with the local proxy bridge[cite: 6, 11].
5. Access the application in browser at `http://localhost:5173`[cite: 6, 11].

### First-Time Setup (fresh checkout)
1. `cp apps/api/.env.example apps/api/.env`, then fill in the values. `.env` is git-ignored.
2. Generate the field-encryption key and paste it into `PROFILE_ENCRYPTION_KEY`: `openssl rand -base64 32`. Back it up: losing it makes stored profile data unreadable. Without it the profile routes answer 503.
3. `npm install` inside `apps/api` and `apps/web`, then `npx prisma generate` and `npx prisma db push` inside `apps/api`.

### Shared Contracts (Zod)
- Request/response schemas are written once in `apps/api/src/contracts`. `apps/web/src/contracts` is a generated, read-only mirror: after changing a contract run `npm run contracts:sync` at the repo root. `npm run contracts:check` (also run in CI) fails if the mirror drifted.

### Exchange Rates
- Comparing living phases in different currencies converts with live rates from free, key-less public APIs: ECB reference rates (Frankfurter) and the official BCRA wholesale rate for Argentine pesos (priced through the ECB dollar). Every converted amount is labelled with its source ("Official rate", "ECB rate" or "Approximate rate"). A built-in approximate table in `infrastructure/fx/referenceFxRates.ts` is only the fallback when a live source is down. A financial/MEP peso rate is planned as a separate provider.

### Bill PDFs
- `POST /api/documents/extract` takes a PDF as the raw request body (`Content-Type: application/pdf`, max 5 MB, max 15 pages). It is read in memory by a worker thread with a time and memory limit; nothing is written to disk and nothing from the document is kept. The browser keeps its own copy for the preview. The answer is a draft (`BillingDraft`); every field the text did not state clearly is `null` and stays mandatory in the review form. A scanned PDF (no text layer) returns an empty draft: there is no OCR.
- The extraction rules are pure code in `apps/api/src/domain/documentExtraction` (locale-aware amounts, dates, vendor dictionary, categories, cadence). New senders go in `vendors.ts`.
- Saving goes through `POST /api/billing-records`. A bill that matches one already recorded (same living phase, category, period, amount and sender) answers 409 `DUPLICATE_BILLING_RECORD`; matching uses a keyed HMAC fingerprint derived from `PROFILE_ENCRYPTION_KEY`. After pulling this change run `npx prisma db push` in `apps/api` (adds `BillingRecord.fingerprint`).

### Tests
- `npm test` (inside `apps/api` or `apps/web`) is hermetic: no network, no database.
- `npm run test:integration` (inside `apps/api`) needs `TEST_DATABASE_URL` pointing at a disposable database, never your real data.

### Stopping the Environment
1. Terminate frontend and backend processes via `Ctrl+C`[cite: 7, 11].
2. `docker compose down` — Tears down the PostgreSQL container[cite: 7, 11].
3. `colima stop` — Halts the Colima VM to release system resources[cite: 7, 11].

---

## Clean Code & Engineering Standards

### 1. Pure, Deterministic Financial Calculation Engines (TDD)
- **Framework-Free Math:** Isolate all portfolio valuation, P&L, FIFO/LIFO lot matching, cost-basis calculations, Time-Weighted Return (TWR), and inflation-adjustment math into pure TypeScript functions[cite: 2, 9].
- **Test-Driven:** Write unit tests covering mathematical edge cases first (zero balance, stock splits, negative cash, multi-currency rounding discrepancies) before writing engine logic.
- **Zero Side Effects:** Never call `Date.now()`, `Math.random()`, or network fetches inside financial calculation helpers[cite: 5]. Pass timestamps, evaluation dates, and FX lookup tables explicitly as arguments[cite: 5].

### 2. Domain-Driven Design (DDD) & Ubiquitous Language
- Enforce unified domain naming across the Prisma schema, Express routes, backend services, and React state[cite: 4].
- Maintain consistent terminology stack-wide: use `Transaction`, `Holding`, `Lot`, and `RealizedGain` rather than alternating with words like "order" or "trade"[cite: 4].
- Encapsulate business logic inside domain entities instead of writing procedural controller code[cite: 4]. Apply "Tell, Don't Ask" (e.g., call `portfolio.calculateValueInCurrency(targetCurrency, fxMap)` rather than manually looping through transactions in a controller)[cite: 5].

### 3. Boundary Validation ("Parse, Don't Validate")
- Share Zod schemas between `apps/api` and `apps/web` to define common transaction shapes, currency formats, and payloads[cite: 3, 4].
- Enforce strict runtime parsing at API entry points[cite: 4]. Once parsed into trusted domain objects, eliminate downstream defensive checks like `typeof val === 'number'`[cite: 4].
- Never permit `any` or untyped loose strings to pass system boundaries[cite: 4].

### 4. Single Responsibility Principle (SRP)
- **Backend:** Express route handlers strictly parse HTTP requests; domain services compute metrics; Prisma models manage persistence[cite: 4]. Keep SQL queries and rebalancing math out of controllers[cite: 4].
- **Frontend:** Separate presentation from orchestration[cite: 4]. UI components receive typed props and render visuals; all data fetching, filtering, and mutations must reside in custom hooks (e.g., `useHoldings`)[cite: 4].

### 5. Dependency Inversion (DIP) & Hexagonal Adapters
- Never couple core valuation logic directly to external providers (Yahoo Finance, European Central Bank FX rates, or AlphaVantage) or database drivers.
- Define abstract interfaces (e.g., `PriceFetcher`, `InflationRateProvider`) and implement third-party HTTP clients as pluggable adapters.

### 6. Command-Query Separation (CQS) & Append-Only Ledger
- **Commands:** State-mutating operations (adding transactions, manual adjustments) update the database ledger and return simple acknowledgments[cite: 5]. Keep heavy recalculations off the write path[cite: 5].
- **Queries:** Net worth curves, tax summaries, and allocations are read-only computations[cite: 5].
- **Immutability:** Treat the transaction history as an append-only ledger[cite: 5]. Correct historical errors via offsetting adjustments rather than destructive row edits[cite: 5].

### 7. Centralized Design Tokens (DRY)
- Define all color hexes, typography scales, spacing, and border radii in the centralized Tailwind config (`tailwind.config.js`) or global CSS variables[cite: 3].
- Never use arbitrary ad-hoc utility classes (e.g., `text-[#1a1a1a]`)[cite: 3]. Use token names like `text-brand-primary` or `font-display`[cite: 3].

---

## Domain Features & Product Capabilities

- **Discipline Scorecard:** Automated audits for user-defined guardrails; flags non-Eurozone asset purchases, unexpected FX drag, and FOMO entries against technical indicators[cite: 2, 9].
- **Life-Event Overlays:** Chronological timeline tracking personal milestones (digital nomad travel, job shifts, relocations to/from Argentina) superimposed over portfolio PnL and volatility[cite: 1, 2, 8, 9].
- **True-Return Toggling:** One-click switches between Time-Weighted Return (TWR) and nominal returns, alongside inflation adjustments to reflect actual purchasing power[cite: 2, 9].
- **Auto-Tagging Exposure Matrix:** Automatic categorization of assets by geography, industry sector, and base currency to reveal concentration risk and cash drag[cite: 2, 9].
- **Routine & Timing Analytics:** Correlation engine analyzing execution timestamps versus outcome returns (e.g., morning versus late-afternoon trades).
- **Fixed Costs Tracker:** Dedicated module tracking monthly recurring expenses to provide integrated runway and guidance visuals[cite: 3, 10].
- **Silent Real-Time Updates:** Background updates powered by Server-Sent Events (SSE) to update prices and alerts without full-page reloads or layout shifts[cite: 3, 10].
- **Passkey WebAuthn Login:** Passwordless biometric authentication providing instant access[cite: 3, 10].