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

### Benchmarks
- `GET /api/insights/benchmarks` compares each living phase with public statistics about its country: where the household income sits among people in the country, how much of the income housing takes against the typical household, and what the income buys at world-average prices (PPP). Every missing comparison comes back with a reason in `gaps`; nothing is guessed. Household size comes from the profile (1 adult, no children if none is saved).
- Sources, all free and key-less, behind the `StatisticsProvider` port (`infrastructure/benchmarks`): Eurostat EU-SILC for European countries (income deciles `ilc_di01`, housing share `ilc_mded01`), INDEC via datos.gob.ar for Argentina (decile means), and the World Bank for every country (PPP factor, GNI per person). Earlier providers win; the World Bank only fills what they do not publish. Add a source by writing another provider and listing it in `mountProfileFeature`.
- Statistics are public, so they are cached unencrypted in `CountryStatistics` (run `npx prisma db push` after pulling) and refreshed when older than 35 days: on demand, and by a daily job that only fetches what is stale, under a Postgres advisory lock so several servers do not repeat it. `BENCHMARK_REFRESH=off` disables the job. A provider outage never overwrites good data, and an outage is never cached as "no data".
- **Positioning card** ("Where you stand"): the primary view is three badges (`phase.standing`: COUNTRY, CONTINENT, WORLD, e.g. `Top 11% in Spain · Top 15% in the EU · Top 2% in the world`, a rung the data cannot place is simply absent), then up to three one-line insights (`describeBenchmarks.ts`: housing against the typical share, "Housing takes 24% of your income — below the 31% average in Spain", the same against the EU, and what the income buys against the national average), then the *other* nationalities' equivalences (`nationalityEquivalences`). Raw figures, citations (name, link, retrieved date), gaps and methodology sit in a collapsed "Data sources". Housing is a comparison with the typical share, never a percentile of households (no distribution is published). The card sits alone in its panel: `.benchmarks` has no rule or spacing above the heading (a test guards it). Not built: city tiers (no free source).
- **Continent and world** (`domain/standing.ts`, `infrastructure/benchmarks/worldBankPipStatistics.ts`). Continent is the **EU** for every European country (EU or not; Eurostat's EU27_2020 aggregate, `ilc_di01` in euros, `ilc_mded01` for housing, income converted to euros with the FX provider), else the person's **World Bank region** (`regionCode` read from the World Bank country API: `LCN` is labelled "Latin America & the Caribbean", `NAC` "North America", ...). World and regions come from the **World Bank Poverty and Inequality Platform** (`pip-grp`, free and key-less): the share of people below each of 19 lines (1 to 500 international dollars a day) *is* the distribution; only the latest year of real survey data counts (`estimate_type=actual`, never a nowcast) and the 2021 PPP round is pinned (`ppp_version=2021`). The person's income is placed as dollars per person per day: household income / people (adults + children) / 30.44 / the country's WDI PPP factor (`purchasing`, same 2021 ICP round) / US price rise since 2021 (`priceIndex`, taken from the year of the PPP factor). Caveats shown in Data sources: the WDI factor is GDP-based, not consumption-based like PIP's own; surveys miss the very rich, so a top place can be slightly generous. An income in a currency that is not the country's is converted through the FX provider, or the rung is left out with `CURRENCY_MISMATCH`.
- **Sync of the areas.** `EU`, `WLD` and the region codes are kept in the same `CountryStatistics` table (no schema change; rows saved before `regionCode` / `referenceDistribution` existed fail the shape check and are fetched again) and refreshed when older than ~183 days (`areaMaxAgeDays`, separate from the 35 days of countries) by the daily job under the same lock; the job derives the areas from the countries in use. The benchmark request never waits for them (a full PIP round takes ~30 s): `CountryStatisticsService.cached()` serves what is stored and starts a background fetch, so the first view after a deploy may lack the continent and world rungs (gaps `NO_CONTINENT_REFERENCE` / `NO_WORLD_REFERENCE`) until the job has run (about a minute after the server starts). An outage never overwrites good data and is never cached as "no data".
- An income in a currency other than the country's cannot be compared with national figures; the phase gets `CURRENCY_MISMATCH` instead of a wrong number. Not built yet: city-level indices (Numbeo, paid), a financial/MEP peso rate, OECD data.

### Costs, bills and income of a living phase
- **One expense wizard** (`profile/ExpenseWizard.tsx`, `ExpenseSteps.tsx`). The Living phases header has one primary "Add expense". It opens a guided flow (`WizardModal`): Start (a large PDF drop zone, or "Enter it manually"), then Sender + what it is for, Amount + how often it comes (Every month, 2, 3, 6 months, Every year, One time only), and Days. Nobody picks how it is stored: `classifyExpense` (`contracts/expenseClassification.ts`, pure, shared with the web) decides from the answers. Anything read from a PDF, a one-time expense and a bill that changes every time (electricity, gas, water, heating / cooling, taxes) is a receipt (`BillingRecord`, with its days). Rent, internet, phone, subscriptions and other that repeat with no days are a declared rate (`FixedCostItem`, renewing the cost of the same name: `costRenewal.ts`). The same with days given (a past bill) asks one last "Will this come again?": yes keeps the frequency, no stores a one-off. Days are a must for receipts and optional for rates; a one-time expense asks one day ("The day it was paid") or, if chosen, "Covers several days". A new rent bill at another price is just another bill of the same phase, averaged by `effectiveCosts`. The words "recurring" and "fixed rate" never appear in the UI. Nobody picks the home: a bill goes to the living phase whose days include the first day it covers (`lib/phaseRouting.ts`; none covering it is an error, never a guess, and the amount is read in that home's currency), a rate to the home lived in today, else the last one. A phase card only has "Manage bills & documents" (the ledger of raw bills, whose "add from PDFs" opens the same wizard on those files). Edit and remove buttons on cost and bill rows show only on hover or `:focus-within` (always on touch screens). The screens carry no instructional subtitles: labels and empty states speak for themselves.
- **Monthly cost per category** is computed once, in `domain/effectiveCosts.ts`, from the declared costs and the bills of the same living phase; the timeline, comparisons and benchmarks all use it. Utilities (electricity, gas, water, heating / cooling) and taxes are *variable*: once a bill exists the cost is the average of all the bills, each weighing the months it covers (a tax is a year per entry, whatever the dates). Rent, internet, phone, subscriptions and other are *baselines*: the declared rate stands until bills arrive, then the cost follows the average of the latest three months of bills per sender, so a change of plan moves it gradually without splitting the phase. Each timeline entry says where a category's number comes from (`costBasisByCategory`: declared, bills or mixed, and how many bills). Taxes never show an "every year" label.
- **Date ranges and cadence.** A bill cannot cover more days than its cadence allows (35 monthly, 66 every 2 months, 100 every 3 months, 370 yearly; one-off has no limit): enforced by the shared contract and the domain, and mirrored in the form. In the form, entering both dates picks the cadence; picking a cadence while the dates are empty fills them, ending today. Rules live in `contracts/billingPeriod.ts`, the form logic in `components/profile/billForm.ts`. "Quarterly" is worded "Every 3 months" everywhere in the UI (the stored value is still `QUARTERLY`).
- **Category suggestion** (`contracts/vendorMatching.ts`, dictionary in `contracts/vendorDictionary.ts`): typing a sender, or reading a PDF, preselects category and cadence in three local layers, first hit wins: (1) senders the person already declared or logged, (2) multilingual service words ("agua", "strom", "aerotermia"), (3) a dictionary of well-known senders across Europe, the UK, North America and Latin America, using the phase's country to tell apart senders that share a name. A suggestion never overrides a pick of the person. Add a sender in the dictionary; add a word in `SERVICE_STEMS`.
- **Batch PDFs.** "Add from PDFs" takes several files (chosen or dropped). Each one goes through `/api/documents/extract` in turn and is confirmed in the same wizard, pre-filled and with the PDF beside the questions ("Bill 2 of 5", Log bill, Skip this one, Cancel to stop). A field the document did not state and nobody has filled in gets a yellow border (no text); a suggestion fills it and removes the border.
- **Income streams.** A phase has any number of `incomeStreams` (`label`, net `amountMinor` per month in the phase's currency, `startDate`, optional `endDate`); none is valid (a sabbatical has €0). Streams of one phase add up per calendar day, so jobs may overlap and a gap is simply zero (`domain/income.ts`: `monthlyIncomeOn`, `earnedIncomeMinor`, `averageMonthlyIncomeMinor`). `PATCH /api/living-phases/:id` with `incomeStreams` replaces the list; they live in the encrypted phase payload: no schema change. Phases saved with the earlier "base income + income changes" are rewritten on read as streams that pay the same on every day (`streamsFromLegacyIncome`) and saved as streams the next time they are written. Streams have no currency of their own.
- **Current rate vs phase average.** The timeline entry carries both: `monthlyIncomeMinor` / `savingsCapacityMinor` / `savingsRate` (streams paying on the as-of day; a past phase shows its last day) and `averageMonthlyIncomeMinor` / `averageSavingsCapacityMinor` / `averageSavingsRate` (what was earned over the phase, divided by the months lived). A phase card has a [Current rate | Phase average] toggle (default current: `IncomeViewToggle`, `incomeFigures` in `phaseRatios.ts`). With no income the card shows what is short each month plus a "Burn rate: -€X/mo" chip, and no percentages.
- Adding a home asks for one optional "Monthly net income" (becomes a stream named "Salary" from the day the home starts); editing a home never touches its income, which is changed in the card's own Income list.
- **Ending a cost, never deleting it.** A declared cost has an optional `endDate` (its last day, in the encrypted cost payload: no schema change; older costs read as never ending). `PATCH .../fixed-costs/:id` with `endDate` ends it, with `null` brings it back. `effectiveMonthlyCosts` takes `asOf`: a cost ended before it, and the bills of the sender it was declared for, leave the monthly burn; the timeline's `totalFixedCostsMinor` still adds what ended costs cost while they ran (`endedCostsBurnedMinor`). The UI has an "End subscription" action on every cost row and an "Ends on" field in the editor; ended costs stay listed as "Ended <date>".
- **Forward projection.** A variable utility's monthly cost is the average of the bills logged, however few (one or two included), and stands for every month after until a new bill moves the average: nothing needs entering each month.
- **Every 6 months** (`SEMI_ANNUALLY`, 190-day bound) is a cadence beside monthly, every 2 and 3 months, and yearly. After pulling this change run `npx prisma db push` in `apps/api` (adds `SEMI_ANNUALLY` to the `CostCadence` and `BillingCadence` enums) and `npx prisma generate`.
- **Input hygiene** (`web/src/lib/inputFilters.ts`): amounts keep only digits and one decimal mark, years four digits, names and cities letters only (no digits); vendor and address fields accept anything, so "O2" and "4D" work. The living-phase flows show no subtitles, hide their main button while a bill is being added, and no longer ask for notes (an existing home keeps its notes).
- After pulling this change run `npx prisma db push` in `apps/api` (adds `HEATING_COOLING` to the `FixedCostCategory` enum). Bills saved earlier that cover more days than their cadence allows still display, but cannot be edited until their dates or cadence are fixed.
- `scripts/contracts.mjs` mirrors every file of `apps/api/src/contracts` (flat folder), so pure code both sides need (`billingPeriod`, `calendarDate`, `vendorMatching`, `vendorDictionary`) lives there too.

### Second Salary
- `GET /api/insights/second-salary` turns the portfolio's net worth into the monthly income it could sustain (`CONSERVATIVE_REAL_YIELD` 6% a year, over 12 months) and sets it against the monthly costs of the living phase being lived today. The maths is pure, in `apps/api/src/domain/wealthMilestones.ts`; the yield is a constant there.
- **The target is the person's own.** There is no fixed band. `PUT /api/profile/second-salary-target` (`{ monthlyMinor }`, `null` clears it, 204) saves it in the encrypted profile payload (`storedProfileSchema.secondSalaryTargetMinor`, no schema change; `PUT /api/profile` keeps it, and it never appears in `GET /api/profile`). `wealthMilestones` takes `targetMonthlyMinor` and returns `target: { monthlyMinor, progress, reached, capitalNeededMinor } | null`.
- **The card** (`SecondSalaryCard`): one plain sentence on what a second salary is, then either a "Set your target" prompt (no target yet, no bar) or one progress bar "€X / month of €Y / month" plus a line on which living costs it already covers. No ticks, no legend.
- Costs covered (internal milestones, shown only as that one line): 1 utilities, internet, phone and subscriptions; 2 rent; 3 every monthly cost ("Living Cost Autonomy"). A milestone whose cost is zero is left out. Costs come from `phaseSnapshot`, so bills move them like everywhere else.
- No milestones come back (with a `gap`: `NO_CURRENT_PHASE`, `NO_COSTS` or `CURRENCY_MISMATCH`) when the cost cannot be compared; the salary and the target are still shown. Costs are not converted to the portfolio's currency yet.
- The portfolio value arrives through the `PortfolioValueReader` port (adapter: `infrastructure/pnlPortfolioValueReader.ts`). No schema change.

### Capital Horizon (milestone targets)
- A person can save up to 3 goals (`CapitalMilestone`: id, title, `targetAmountMinor`, `capitalRequiredPercentage` 1–100, category `PROPERTY | SABBATICAL | VENTURE | CUSTOM`, `enabled`, off until configured). They live in the encrypted profile payload (`storedProfileSchema`), so there is no schema change; `PUT /api/profile` keeps them, and `PUT /api/profile/capital-milestones` replaces the whole list (204). Defaults per category are `DEFAULT_CAPITAL_REQUIRED_PERCENTAGE` (property 30, the rest 100).
- `GET /api/insights/capital-horizon` returns each goal with its pace, from `capitalMilestonePacing` in `domain/wealthMilestones.ts`: capital needed = target × percentage, gap = what the net worth lacks, months = gap ÷ the monthly surplus (income minus costs of the phase being lived) rounded up. No surplus, a deficit, or no comparable phase gives `monthsRemaining: null` and a `gap` reason; an achieved goal is always 0 months.
- The web card (`CapitalHorizonCard`) shows only enabled goals, and a quiet "+ Set a milestone target" (with Property / Sabbatical / Custom presets while none is set). Editing, deleting and creating all go through one dialog and one save of the whole list. The dialog has room (24px padding, 20px between fields) and one footer row with Cancel and Save milestone; Delete is a quiet link above it.

### Profile page (two tabs)
- The page has two tabs (`ProfileTabs`, a real `tablist` with arrow keys, Home and End; the open one is remembered for the session by `lib/profileTab.ts`). **Living Costs & Career**: living phases ("Add expense" is the only solid button; "Add living phase" is outlined), phase cards, and the collapsed Demographics & Household card at the bottom. **Milestones & Positioning**: Second Salary, Capital Horizon and "Where you stand" (for the home lived in today, else the last). Before the first home and profile exist there are no tabs, only the one button that starts the first-time flow.
- A phase card always shows one line for the income paying today (`Designer · €3,200/mo`, or `No income right now · since <day>`, or `2 jobs · €X/mo`; `incomeSummary.ts`) and an "Income & Career · + Add job / sabbatical" trigger that opens the income list (`IncomeSection`) inside the card, without expanding it.

### Jobs and income lifecycle
- **Every job is its own stream** (`IncomeStream`); ending one never touches the others. A stream has an optional `kind` (`ONE_TIME` = a deposit that arrived once, such as a benefit; absent = pays every month) and, once ended, an optional `endReason` (`LAID_OFF | QUIT | CONTRACT_FINISHED | OTHER`, a label only: it changes no figure). Both live in the encrypted phase payload (no schema change); older streams read as monthly, without a reason.
- **Calculations.** A `ONE_TIME` deposit counts once in `earnedIncomeMinor` / `averageMonthlyIncomeMinor` when its day falls inside the stay and is not after `asOf`, and never in `monthlyIncomeOn` (current rate, savings capacity). After the last monthly job ends the stretch counts €0. `contracts/incomeGaps.ts` (pure, mirrored to the web) gives `incomeGaps` ("No income from X to Y"; the time before the first job is not a gap) and `jobsToCarry`.
- **UI.** Each income row has "End job" (last day + reason chips) and, once ended, "Bring back"; rows are grouped Paying now / Ended / One-time deposits (`groupIncome`). The editor offers "Pays every month" or "Paid once".
- **Keeping jobs in a new home.** Adding a living phase offers the monthly jobs still paying on its first day from the home lived in just before it ("Keep these jobs?", all ticked; `carryOver.ts`, `CarryJobs`). Copies start on the first day of the new home and the originals stay; in another currency the amount must be typed again, never converted.
- **Profile page buttons.** "Add expense" and "Add living phase" share `.profile-action-button` (one footprint; `--primary` / `--outline`). Compare shows only with two or more homes; the Demographics "Edit" only while its card is open.

### Guided flows (wizards)
- Onboarding ("Tell us about yourself": About you, then the first living phase with its bills), adding or editing a living phase, and Log Transaction all open as a centered dialog (`components/Modal.tsx`). There are no side drawers. Multi-step flows use `components/wizard/WizardModal.tsx` (milestone progress bar, Back/Continue, Enter to continue); the caller owns the answers and decides when a step is complete.
- Every step is saved as a draft in `sessionStorage` (`lib/stepDraft.ts`, `hooks/useStepDraft.ts`), so closing the dialog or refreshing resumes on the same step. A draft survives a refresh but not the end of the tab, is parsed with a Zod schema before use, is cleared when the flow saves, and `clearAllDrafts` runs on sign-out: personal answers are stored encrypted on the server, so they are not left readable in the browser.
- A living phase has no name field. Its header is always `[flag] [City] [Address]` (`lib/phaseName.ts`), sent as `name` on save; `useLivingPhases` shows older phases under the same generated name. Dates: neither `Moved in` nor `Moved out` may be after today (the server's `asOf`), and `Moved out` must be after `Moved in` (`components/profile/phaseForm.ts`). The API still accepts what it accepted before; these rules are enforced in the web form.
- `CountrySelect` is a type-to-search combobox (`lib/countrySearch.ts`): names in English and Spanish, from the beginning first and from anywhere inside after that, ignoring accents and case. Nationalities use `NationalitiesInput` (pills on Enter or comma).
- Every `<select>` gets its chevron and right padding from one rule in `index.css` (`--select-chevron-inset`, `--select-padding-end`).

### Dashboard figures, selling and holdings
- **Prices.** Open positions are valued at market price through the `PriceProvider` port (`infrastructure/market`: Yahoo Finance adapter, converted to the person's currency, cached 5 minutes; an outage is never cached). A position with no price is shown at cost and the hero says so (`pricesAvailable: false`). History before today stays at cost (no price history is kept); only today's point is at market value.
- **One definition of return** (`domain/portfolioReturn.ts`): total gain = sold profit + gain on what is still held + dividends - buying fees. Net worth = cash + open positions at market. `GET /api/portfolio/stats` returns `openProfit`, `openMarketValue`, `dividends`, `pricesAvailable` next to `soldProfit` and `totalProfit`. Dividends arrive as deposits and are not counted as money put in.
- **Period return** is computed in the web from the value history (`lib/periodReturn.ts`, Modified Dietz; `lib/returnForPeriod.ts`) and feeds both the chart subtitle and the "Gain <period>" tile, so they always agree. `HeroMetrics` holds every headline tile above the chart; labels use plain words ("Still held", "Total gain or loss", "Fees paid").
- **Selling.** `POST /api/transactions` with `SOLD` answers 400 (`INSUFFICIENT_HOLDINGS`, with `availableUnits`) when the instrument is not held or the units would not be covered on that date or at any later sale (`domain/holdingLedger.ts`). A sale takes only its share of the cost basis (`domain/openPosition.ts: costBasisOfSale`); history uses `domain/portfolioHistory.ts` and no longer counts realized profit twice. The Sold tab lists only owned holdings (`OwnedHoldingPicker`), locks asset class, sector and region, and offers `Available: X units` with MAX.
- **Holdings toolbar:** search, funnel filter (asset class, sector, region: `lib/holdingsFilter.ts`) and "Customize columns" on one row. The top bar uses `--z-header` and a blurred background.

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