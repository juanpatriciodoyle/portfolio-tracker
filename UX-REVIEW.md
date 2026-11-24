# UX and insight review: Portfolio Tracker (guest "sneak peek" plus a fresh account)

Method: single-reviewer assessment through a private browser context (impeccable critique rubric: heuristics, cognitive load, personas). The detector overlay and sub-agent split were not run, because they would write into the repo; this is design review plus measured browser evidence. Nothing in the repo was edited. Screenshots: `scratchpad/ux-shots/` (79 files). Viewports 1440x900 and 390x844. Console: no errors or warnings on any screen.

Accounts used: the shared guest (Joe), and a throwaway passkey account `reviewer@example.test` created on the trial stack (virtual authenticator). I logged 2 buys and 1 sale and 1 PDF bill there.

Health score (Nielsen, 0-4): visibility of status 3, real-world match 2, control and freedom 3, consistency 2, error prevention 1 (silent wrong defaults, negative cash allowed), recognition 3, flexibility 2, minimalism 3, error recovery 3, help 2. Total about 24/40: acceptable. The look is calm and credible. Where it loses points is **trust in the numbers** and **jargon**.

---

## 0. Headline

The app owns unusually rich data (cost per category, income streams, savings capacity, goals, benchmarks, fees, FX, inflation) but the home screen speaks in **tables and four sub-numbers**, while the one screen that talks like a human (the profile "Where you stand" and the phase card) is **hidden behind a profile that the guest and every new user never reach with data**. Three numbers on the home screen also contradict each other, which costs more trust than any amount of polish can earn back. Fix trust first, then turn the data into sentences.

---

## 1. Top 5 opportunities (insight-centred)

### 1. Make the numbers agree, then add one "what happened" sentence under the hero

Now: the hero says Total value €468,536; the chart behind it ends at about €390k (`04-chart-hover-end.png`; on 1D the line sits at €395k, `11-1d.png`). "Invested €444,036" is actually the market value of holdings: the "Net cash invested" column sums to €340,450 (`03-home-full.png`). Cash says €24,500 in the hero but the Cash pills show USD $12,500, GBP £6,000 and EUR -€88,171. Period picker: **1D shows "+€103,586, +36.55% in the past day"** and YTD "+38.39% this year" (`11-1d.png`): the whole unrealised gain is attributed to today because history before today is stored at cost, so the growth chart is a staircase and then a cliff (`04-chart-hover-end.png`, `08-chart-pl.png`). The Performance bar chart prints "2020: -€50.0K, 2021 to 2025: -€9 to -€24, 2026: +€103.6K" which add up to nothing the user can reconcile with +€108k (`05-scroll-3.png`).
Why it hurts: a non-expert cannot check maths but feels contradiction; one absurd number ("+36% in a day") discredits all the true ones.
Change: (a) rename "Invested" to "Holdings value"; make cash one agreed figure everywhere. (b) Until price history exists, **do not show windows (YTD/1D/...) or the growth chart as value over time**: show "Since you started" only, and plot cost vs today as two honest dots, or start snapshotting daily value now and label earlier history "estimated at cost". (c) Replace the "Still invested / Already sold" sub-row with **one plain sentence**, e.g. "You're up €108k (+38%). Apple and the S&P 500 fund made €94k of that; Nvidia is down €44k. A world index fund would have made you €X less." (see insights I1, I2). The "How this adds up" ledger can stay as the proof.

### 2. Fix the first 10 minutes: value first, cash-aware buying, three questions not seven

Now (fresh account, `41-after-passkey.png`, `63-first-value.png`, `67-after-sale.png`, `68-populated-mid.png`): empty dashboard shows full chrome (10 period buttons, empty chart, legend) and says nothing about the 7-step profile. After the first buy of €1,800 the hero reads **Total value €1,154, Cash -€1,800, Total profit +€1,154, "0.00% since you started"**; after two buys and a sale the Allocation panel shows **Apple 127.08% and Vanguard 44.62%** (negative cash in the denominator), "+64.12%/year" for a 1-day holding, and a chart whose x-axis reads "Nov 26 / Nov 26 / Nov 26 / Nov 26". Cause: nobody told the user to log a deposit first, and a buy with no money behind it is silently allowed. The Bought form also leaves Sector "Technology" and Region "Europe" for Apple (not auto-tagged), `61-buy1-filled.png`.
Change: a "Bought" form gets one more row, "Paid with: money I add now (creates the deposit) / cash already in my account". Show the live price beside the fields ("Apple trades at €295 today; you entered €180/share, correct?"). Auto-fill asset class, sector, region from the ticker search result and show them as editable chips, not three selects. First empty state = one card: "Add your first purchase" with the form inline. After the first save show a **first-value line**: "You own 10 Apple shares worth €2,954. That is 100% of your portfolio in one company." Move the 7-step profile behind the first value ("Want to see what your portfolio could cover? 3 questions") and cut it to country, monthly income, rent (see section 3).

### 3. Join the two halves: "what you keep" meets "what you invest" meets "what it could pay"

Now: the profile phase card is the best card in the app (`54-after-finish-full.png`: "€2,215 left each month, Saved 69%, Housing 30%") but it lives in a separate page, never touches the portfolio, and the guest sees none of it (`30-profile-top.png`: one lone button). Second Salary shows "Your portfolio pays €0 / month" plus a generic sentence (`55b-milestones-full.png`).
Change: a single strip under the hero (or replacing the unlabeled profile icon's mystery): "You keep about €2,215 a month after fixed costs. Your portfolio could cover about €2,300 a month at a cautious 6%: all your rent and bills (€985). At your current pace your €X goal is N years away." Seed the **guest account with a profile** so the demo shows it. Details in I3, I4, I6.

### 4. Replace the "chart cemetery" with three plain-language panels

Now: below the fold there are Growth (3 modes x 3 lines), Holdings (7 columns, 3 of them jargon: "Net cash invested", "Holding return (MWR)", "Value per share"), Allocation (4 tabs), Performance (P/L or %, bar or heatmap, 9 period chips) and Transaction History: 5 panels, 20+ toggles, 0 sentences.
Change: keep Holdings as the ledger but default to 4 columns (Name, Value, Profit in € and %, Share of portfolio); move the rest to "Customize columns" (already exists). Replace Allocation tabs with one sentence plus one bar ("Tech is 54% of what you own; your 3 biggest holdings are 56%. Worth knowing, not a problem by itself"). Drop the Performance bar chart until it can be true (see opportunity 1), or turn it into "Your best and worst year" in words. Rename: Position -> "Units", Holding period -> "Held", MWR -> "Yearly return" with the "per year" only when held > 1 year (currently "+138%/year" and "+50.59%/year" on a **1-day** closed TSLA, `18-closed.png`).

### 5. Mobile must be a first-class screen and the vocabulary must be one

Now (`70-mobile-top.png`, `71-mobile-s1.png`, `71-mobile-s2.png`): the page scrolls sideways (scrollWidth 427 vs 390), and in Holdings the **Value, Profit and Return columns are off-screen**: a phone user sees names, units and days, and nothing about money. All 59 interactive controls are under 44 px in at least one dimension. The header loses its labels: the inflation switch is a bare toggle.
Vocabulary drift in one session: "Total profit / Profit / Net profit/loss / Profit/loss / P/L / Performance / Return / MWR / Growth"; "Invested / Net cash invested / Total Money Invested / Holding"; "Transaction / Bought / Sold / Deposit / Withdraw"; asset class "Stock, ETF, Crypto, Bond, Real Estate" in the form but "Equity, Fixed Income, Cryptocurrency" in the filter; "Crypto" appears both as an asset class and as a sector.
Change: holdings as cards under 700px (name, value, gain in € and %, share bar); one glossary decided with the owner (see questions) and enforced in code; labels back on the mobile header.

---

## 2. Insight opportunities (ranked by value to a non-expert)

Format: insight in user words / data source / where it lives and what it replaces / how not to be wrong or alarming / effort.

**I1. "What is driving your profit" (the story under the hero)**
- Words: "You're up €108,365 since you started. Apple and the S&P 500 fund earned €94k of it. Nvidia is down €44k, the biggest drag."
- Data: `/portfolio/stats` (openProfit, soldProfit, totalProfit), holdings per-instrument net profit/loss (already in the table), fees, dividends. No new data.
- Where: one sentence under "Total profit", replacing the "Still invested / Already sold" sub-row (ledger stays in "How this adds up"). Two contributors max plus one detractor.
- Safety: only when pricesAvailable; show detractor only if loss > 5% of total profit or > €500; never name a "mistake"; if a single holding is >70% of profit say "mostly one company". Skip with fewer than 2 holdings. Effort S.

**I2. "Compared with the simple option"**
- Words: "If the same money had gone into a world index fund (MSCI World) you'd have €23k more / €8k less. Your portfolio grew 7.1% a year, the index 8.4%."
- Data: history already carries the MSCI World benchmark line plus net contributions (the orange line in Growth). No new data.
- Where: a second sentence next to I1, replacing the Benchmark legend row and the Performance chart. The chart can stay behind a "Show chart" link.
- Safety: needs the history fix first; below 12 months say "too early to compare" (never annualise a 1-day period); state "before fees and tax"; same-direction wording both ways, no red for being behind. Effort M.

**I3. "How much you keep, and where it goes" (savings rate trend)**
- Words: "You keep 69% of your income after fixed costs, up from 58% in your Barcelona phase" or "Your costs rose €37 a month since June; Internet is most of it."
- Data: `/living-phases/timeline` (savingsRate, averageSavingsRate, monthlyFixedCosts, months), phase comparison (deltas by category, fixedCostsDeltaFraction), `/insights/trends` (3/6/12 month windows, observed vs declared drift). Exists.
- Where: top line of the phase card (replaces "Fixed costs paid €46,901" which is an extrapolation shown as fact: one October bill became 45 months of cost). Also the first row of the Milestones tab.
- Safety: label "left after fixed costs" (today the card says "Saved 69%" but food, transport and leisure are not counted, so people will read it as real saving); needs 3+ bills for "rose/fell" claims; threshold 10% and €5; heating/cooling are seasonal, compare year on year. Effort S to M.

**I4. "What your savings did" (the bridge between profile and portfolio)**
- Words: "Since March 2023 you could have kept about €99k after fixed costs. You've invested €62k of it, €37k is not in your portfolio (cash or other)."
- Data: timeline totalIncome minus totalFixedCosts per phase; portfolio net contributions (history). Same currency only (the code already refuses to mix: reuse `CURRENCY_MISMATCH`).
- Where: Milestones tab and a collapsed line on Home; replaces the generic Second Salary paragraph.
- Safety: say "could have kept", never "should have invested"; hide if no income stream; excluded spending named. Effort M.

**I5. "Is your portfolio working like a paycheck?" (Second Salary in words)**
- Words: "At a cautious 6% a year your portfolio could pay about €2,300 a month. That covers your rent and bills (€985). Target €3,000: you're 77% there."
- Data: `/insights/second-salary` (milestones, target.progress, capitalNeededMinor); `/insights/capital-horizon` (monthsRemaining). Exists.
- Where: Home, third element under the hero as a goals strip, replacing nothing (it absorbs the empty space right of Total profit; the hero is only two figures wide on a 1200px canvas). Profile keeps the editor.
- Safety: present the 6% as an assumption in the sentence; give a range or "about"; if no profile show a single prompt, not €0; never "financial independence" claims. Effort S (data exists, only placement and copy).

**I6. "Time to your goals at your current pace"**
- Words: "A 30%-down payment on a €300k flat needs €90k. At your pace of €2,215 a month that is about 22 months away."
- Data: `capitalMilestonePacing` (monthsRemaining, gap reasons), monthly surplus from timeline.
- Where: Home goals strip with I5 (max one goal visible, others one tap away).
- Safety: monthsRemaining null with a gap reason must show the reason in words ("add your income to see this"), never a blank; round months up to the half-year beyond 24 months; assumes no market move: say so. Effort S.

**I7. "Data check" (the insight that protects every other insight)**
- Words: "Your cash is -€1,800: you bought before adding the money. Add a deposit of €1,800?" / "Nvidia: you paid €286 a share, today it costs €108: is that right?" / "No prices for Bitcoin today, shown at what you paid."
- Data: cash balances (negative), buy price vs live quote (PriceProvider), pricesAvailable flag. Exists; the price comparison is new but cheap.
- Where: a dismissible one-line banner at the top of Home, replacing the empty-state paragraph; one issue at a time, with a one-tap fix.
- Safety: only certain facts (negative balance, price off by more than 5x), never judgement. Effort S to M.

**I8. "Idle cash and inflation"**
- Words: "€24,500 (5% of your total) is cash. At 2.9% inflation (Spain) that loses about €710 a year of buying power."
- Data: cash balances per currency, inflation rate already configured behind the "Spain" chip, total value. Exists.
- Where: the Cash pill row at the bottom of Holdings, which today is a row of currency chips; promote to one line in the hero's second row ("Cash" figure gets the sentence on tap).
- Safety: show only when cash > 10% of the portfolio and > €1,000; foreign currency cash: state "plus currency moves". Not advice: no "invest it". Effort S.

**I9. "How concentrated you are", in plain words**
- Words: "54% of what you own is technology. Your top 3 holdings are 56%. One company, Vanguard S&P 500 fund, is 28%." plus "Only 38% of your money is in euros, the currency you spend in."
- Data: allocation by sector, region, asset class, holdings (all four tabs, already fetched); instrument currency vs phase currency (check whether the instrument currency is stored; if not it is new data). "Diversified" funds must not count as concentration.
- Where: Allocation panel: one headline sentence and one bar replace four tabs by default (tabs remain as "Explore").
- Safety: neutral language ("worth knowing"), thresholds: single sector > 40%, single company > 25%, ETFs excluded from the company rule; crypto share > 10% gets a factual line, no adjectives. Effort M.

**I10. "Since you last looked"**
- Words: "Since Tuesday: +€1,240 (+0.3%). Biggest mover: Nvidia -4%."
- Data: needs a stored last-visit timestamp and **daily value snapshots** (new data; today there is no price history, which is also the root cause of the 1D and chart problems).
- Where: replaces the "Good evening, Joe" subtext.
- Safety: show nothing when the move is under 0.5% ("Quiet week"); never alarm on a down day, give the one-year context. Effort L (prerequisite for honest windows, so worth doing anyway).

**I11. "Real return" without the switch**
- Words: "+38% before inflation, +9.6% after inflation." (From the guest account: profit goes from +€108k to +€27k with the switch on, `13-inflation-on.png`, a number people should see by default.)
- Data: inflation-adjusted stats already computed.
- Where: second line of Total profit; the header switch becomes "Show everything after inflation" and remains for the full page. Replaces the "since you started" line.
- Safety: the rate source and date next to it; don't show if the portfolio is under a year old. Effort S.

**I12. "Where you stand", rewritten to avoid misleading**
- Now: "Housing takes 29.7% of your income, above the 16% average in Spain" (also repeated for the EU, `55b-milestones-full.png`). The user is renting and that average blends owners with no mortgage, so a renter is always "above average".
- Words: "Renters in Spain spend about 38% of their income on housing; you spend 30%." Use the tenure the user gave in onboarding ("Renting").
- Data: benchmarks `housing share` filtered by tenure if available, otherwise omit the comparison (the guide already says never guess). Fold the EU line into Spain's when they say the same.
- Safety: when a comparison is not like for like, drop it. Keep the three "Top x%" badges (good), add "among people in Spain" so "Top 1% in the world" does not read as boasting. Effort S to M.

---

## 3. Onboarding and first-run

Measured: sign-up to first insight took, for a typical person, about 10 to 15 minutes of reading and typing across 7 steps (scripted run: 14 s, but 11 inputs, 7 Continue clicks, one sub-wizard). The first number about their own life ("€2,215 left each month") appears only on the 7th step and after "Finish"; the first portfolio number arrives only after the user finds "Log Transaction".

| Pri | Finding | Evidence | Proposed change |
|---|---|---|---|
| P0 | The passkey button has **no email field**; the email is read from storage and falls back to a hardcoded `juan@portfolio.local` (`LoginModal.tsx`). A stranger clicking "Continue with Passkey" targets the owner's identity (my first click returned "Passkey prompt was cancelled", no sign-in happened; I then set my own test email in storage to register). | `40-passkey-click.png`, code `LoginModal.tsx` lines 65-80 | Ask for the email in the modal, never default; show "Create account" vs "Sign in" explicitly. |
| P0 | A buy is allowed with no money behind it: negative cash, 0.00% return next to a profit, allocation above 100%. | `63-first-value.png`, `67-after-sale.png`, `68-populated-mid.png` | See opportunity 2 and I7. |
| P1 | After sign-up the dashboard says nothing about the profile; the profile is an unlabeled person icon. The profile page for a brand-new user is a card with one button, "Tell us about yourself", and no stated reward. | `41-after-passkey.png`, `42-new-profile.png` | One-line promise on the button: "Add where you live and what you earn to see what your portfolio could cover (2 minutes)". |
| P1 | Seven steps, but only name, country, city, move-in date really matter (and the sums only need country, income, rent). The 7 equal dots (You, Roots, Life, Where, When, Money, Bills) hide that Roots and Life are optional and that income and the bills are skippable. "Optional" appears in grey inside labels, easy to miss; Continue stays the same weight on every step. | `46-onb-life.png`, `49-onb-money.png` | Three questions: country and city (autocomplete), "How much comes in each month?" (optional, can skip), "What is your rent?". Everything else moves to "Tell us more later" inside Demographics. |
| P1 | Name field is empty although the greeting already says "Good evening, Reviewer"; year of birth asked on step 1 with no reason. | `43-onb-1.png` | Prefill from the greeting, state the reason or drop the field ("Used to compare you with people your age" or nothing). |
| P1 | Past tense on a present question: "What came in each month?" and, with a missing city, "Which city was it?" under "Where do you live?". | `49-onb-money.png`, `33-onboard-empty-continue.png` | "What do you earn each month, after tax?" and "Which city?". |
| P1 | Step "Bills" is an empty page with a link-style "Add a bill"; **a different form** from the main "Add expense" wizard (chips plus "Ends on (optional)") although it asks for "Amount each time" and "Label (optional)", and it shows the "Subscriptions" chip highlighted before the user chose. | `50-onb-bills.png`, `51-onb-addbill.png` | Reuse the Add expense wizard (or its PDF drop zone) in the Bills step; nothing pre-highlighted. |
| P1 | No value while typing. Every step is a blind form. | all onboarding shots | Live "what we know" line per step: country -> "In Spain the middle household earns about €X a year"; income -> "That puts you in the top ~Y% of Spain" (the standing already exists); rent -> "That is 30% of your income; 35% is a common upper limit" (state the source). Keep each to one line, no charts. |
| P2 | Refresh mid-flow resumes the step and answers (verified), but the dialog is closed after refresh and the user must click the button again. | `45-resume.png` | Re-open the dialog on the same step automatically. |
| P2 | Finish gives a small "Profile saved" and lands on the profile card; the natural next step (log a transaction, set a target) is not offered. | `53-after-finish.png` | After Finish: "Your portfolio could pay about €0 / month today. Add your investments to start." with the Log Transaction button. |
| P2 | PDF path is good: drop, ~4 s read, Iberdrola and Electricity and 62,45 EUR and the Oct dates were all prefilled, with a three-step confirmation. But after logging it, nothing says what changed: "Saved 69% -> 67%". | `91-expense-pdf.png`, `93-expense-days.png`, `94-after-bill.png` | Toast: "Electricity €62/month added. You now keep 67% (was 69%)". |
| P2 | A cost row shows "Monthly" for declared costs but nothing for the logged electricity bill, so the list mixes two kinds of row. | `94-after-bill.png` | One row format: "Electricity · from bills · €62/month (1 bill)". |

---

## 4. Screen by screen

### Login (`01-login-desktop.png`)
- P1 Value proposition missing: "Passwordless & Biometric Authentication" tells the visitor how, not what. Replace with "See everything you own in one calm place."
- P1 "Zero passwords stored. Encrypted session." is the only trust signal and sits under the guest button; say what is private ("Your numbers are encrypted; we never see your passwords").
- P2 The guest CTA is the loudest element (blue outline plus emoji) above the real sign-ups: fine for a demo, but "Would you like to take a sneak peek?" is a question, not a verb. "Try the demo" is quicker. Emoji breaks the "no emoji" rule in the header.
- P2 Language switch (English / Español Argentina) is good and discoverable.
- P2 Page title is "$ tracker" on every screen.

### Home: hero (`02-home-top.png`, `06-how-adds-up.png`)
- P0 Number conflicts and period nonsense: see opportunity 1. Also "Invested €444,036" is value, not money invested.
- P1 Two hero figures are good, but right of them 60% of the width is empty on desktop; use it for the story (I1, I5).
- P1 "0.00% since you started" beside +€1,154 for a new account; "since you started" is also unclear when the account started today.
- P2 Cents on a six-figure number, rendered in grey: noise. Drop cents above €1,000 (the profile card already shows "€2,215" without cents but "€143,285.15" with: pick one).
- P2 "What you own today" under a label "Total value": one of the two is redundant.
- P2 The period picker has 10 chips (All, YTD, 1Y, MTD, 1M, 1W, 1D, Last year, Last month, Custom). MTD, 1W, 1D and Last month are for traders; keep All, 1Y, 3M... plus Custom.

### Home: Growth chart (`04-*.png`, `07-chart-tooltip.png`, `08-chart-pl.png`, `09-chart-perf.png`)
- P0 Staircase then cliff (history at cost); Value, Profit/loss and Performance modes all inherit it, Profit/loss is a flat line then a spike.
- P1 Axis dates "Jan 20, Feb 21, Aug 22, ... Nov 26" are ambiguous (month plus 2-digit year looks like a day) and the last is clipped; with one day of data all four labels read "Nov 26".
- P1 Legend sits below the fold at 900 px; three unexplained lines (the "Net contributions" line is nearly invisible, a dashed grey). The benchmark is above the portfolio most of the way: the most interesting fact on the screen is unlabeled (I2).
- P2 A mouse hover in my capture produced no tooltip (headless pointer; verify by hand).
- P2 Three modes x three lines is a lot of choice for one chart; default to one line plus benchmark.

### Home: Holdings (`05-scroll-1.png`, `15-filter.png`, `16-columns.png`, `18-closed.png`)
- P1 Numbers a layperson does not know: Position ("1,050", units), Holding period ("2477 days", better "6.8 years"), Net cash invested, per share, Value per share, "Holding return (MWR)" and its sub-line "Net profit/loss" (two headers in one cell), Allocation %. Help "?" buttons show nothing visible in my capture (`17-mwr-help.png`).
- P1 "+138.40%/year" is an annualised figure for everyone; a 1-day holding shows "+64%/year" and a closed 1-day trade "+50.59%/year" (`18-closed.png`). Use total gain, and show the per-year figure only after a year.
- P1 Closed positions appear as "TSLA CLOSED / TSLA" with "0 (Closed)" and "1 days": dedupe the label and show "Sold".
- P2 Sort icons on every header (7 chevrons) plus allocation bar plus % column: the allocation is shown twice per row.
- P2 Good: search, filter and column menu are tidy; the filter lists real asset classes only.
- P2 Negative cash is shown as "-€1,800.00" in the hero and "€-88,171.00" in the pills: two formats, no colour.

### Home: Allocation and Performance (`05-scroll-2.png`, `05-scroll-3.png`)
- P1 Allocation with negative cash (new user) exceeds 100%; sector "Diversified" (27.9%) and "General Market" are not sectors a layperson knows.
- P1 Performance bar chart is misleading (see opportunity 1) and its "2020 -€50.0K" is unexplained.
- P2 Reveal-on-scroll leaves a blank hole in full-page captures (`03-home-full.png`); fine for users, but check print and screenshot tools.

### Log Transaction (`20-log-tx.png`, `61-buy1-filled.png`, `64-sell.png`, `66-sell-filled.png`)
- P0 No cash source on Bought (see opportunity 2). Auto-tagging missing: Apple saved as Europe.
- P1 Eight fields on Bought; label wording "Total Money Invested (€)", "Type 3+ letters" (an instruction instead of an affordance), "Transaction Date (Past or Present)".
- P1 Sold form shows asset class, sector and region selects before a holding is picked; they should not appear at all (they lock after the pick).
- P1 A dollar-sign icon on a euro app. Tabs "Bought / Sold / Deposit / Withdraw" mix tenses; there is no Dividend tab although dividends are part of the profit ledger.
- P2 Good: ticker search is live and fast, "Available: 10 units" and MAX on the sale are excellent, Esc closes, success is immediate and the hero updates in under 3 s.

### Header and settings (`12-country-chip.png`, `13-inflation-on.png`)
- P1 The "Spain" chip opens "Inflation Country / Annual CPI Inflation / Eurostat / INE sync service / Sync Latest": a user reads "Spain" as where they live. Label it "Inflation: Spain".
- P2 Profile is an icon with no label on desktop and mobile; sign-out is an icon with no confirm.
- P2 Inflation switch is the only header text and does a page-wide change: see I11.

### Profile page (`30-profile-top.png`, `54-after-finish-full.png`, `55b-milestones-full.png`)
- P0 For the guest the profile is empty (one button): the best insights are not demonstrable. Seed the guest with a phase, income, bills and two milestones.
- P1 Phase card: "Saved 69%" means "left after fixed costs"; "Fixed costs paid €46,901" is an extrapolation of a handful of bills. "Earned €143,285.15" similarly assumes the present salary since March 2023.
- P1 "Income & Career · + Add job or income" is a tiny link pair; the primary job is hidden in a toggle.
- P2 Header reads only "Madrid" with a flag; the address given is not shown; "CURRENT" chip is good.
- P2 "Add expense" solid vs "Add living phase" outline is the right hierarchy. Delete phase is a red link on the card (verify it asks to confirm).
- P2 Milestones tab: "Where you stand" has the best hierarchy in the app (one large badge, two smaller, three sentences); the duplicate housing line for the EU is redundant; "Data sources" collapsed is right.

### Accessibility and responsive (measured)
- P1 Mobile: sideways page scroll (427 vs 390), holdings money columns off-screen (`71-mobile-s2.png`), period rail cut at "Las", chart axis clipped, targets under 44 px everywhere (59 of 59).
- P1 Tiny text: 87 of 260 text nodes in main are 11-12 px; table sub-headers are 11 px at 4.35:1 against black, just under AA. Placeholder 4.56:1 passes.
- P2 Keyboard: focus ring is visible (3 px) and the order is logical (header, hero, period, chart) but there are 10 stops in the period picker and no skip link; the first tab stop is the inflation switch, so reaching Holdings takes about 30 Tab presses.
- P2 One H1 per screen (good); chart canvas has no text alternative; colour carries gain/loss, with sign and "+" also present (good).
- P2 Motion: not judged in stills; the count-up is sensible given reduced-motion handling in the stylesheet.

### Number glossary test (does a layperson know what it is?)
| Label | Knows? | Note |
|---|---|---|
| Total value, Cash | Yes | but Total value and chart end disagree |
| Invested | **No / wrong** | is holdings value |
| Total profit, Still invested, Already sold | Mostly | "Still invested" under profit reads as money, it is gain |
| How this adds up | Yes | good |
| Net contributions, Benchmark value (MSCI World) | No | explain: "money you put in", "world stock index" |
| Position, Holding period | No | Units, Held |
| Net cash invested per share | No | "What you paid per share" |
| Holding return (MWR) | No | jargon: "Yearly return" |
| Allocation % | Partly | "Share of portfolio" |
| P/L, TTM, Heatmap | No | |
| Saved 69%, Housing 30% | Yes, but misleading | rename "Left after fixed costs" |
| Top 11% in Spain | Yes | say "of people in Spain" |

---

## 5. Quick wins (each under 30 min)

1. Rename "Invested" to "Holdings value" (hero, i18n) and "Position" to "Units".
2. Drop annualisation under 1 year in the Holdings return column; show total %.
3. Chart x-axis: show "Mar 2024" style and never repeat labels; hide the axis when all points are on one day.
4. Show the "?" help as a visible popover on click (verify it works) and add one for Net contributions and Benchmark.
5. Rename the header chip "Spain" to "Inflation: Spain".
6. Remove "Type 3+ letters" from the ticker label and put it in the placeholder.
7. Fix "Which city was it?" and "What came in each month?" copy.
8. Hide asset class, sector, region on the Sold tab until a holding is picked (and then show as text).
9. Format negative money one way ("-€1,800") and colour it.
10. Remove cents above €1,000 in hero and phase card; one style.
11. Page title: "Portfolio Tracker" (and per-route titles).
12. Add `aria-label` plus visible label back on the mobile inflation switch.
13. Remove the duplicate EU housing line when it repeats Spain's.
14. Add a skip link and reduce the period picker to 6 chips.

---

## 6. Keep: already good, do not lose

- The true-black calm look, restrained palette, generous hero numerals; the two-figure hero (value beside profit) and "How this adds up" with one-line meanings.
- Semantic colour with sign: gains green with "+", losses red with "-".
- "Where you stand": one large badge, two small ones, then plain sentences, sources collapsed.
- The phase card: current rate vs phase average toggle, "€2,215 left each month" with two simple bars.
- PDF bill reading with a three-step review (it read sender, category, amount and dates correctly), and the single "Add expense" entry.
- Sale form: "Available: X units" with MAX; ticker search with live results; Esc and Cancel everywhere; draft resume on refresh.
- Honest empty copy ("Nothing here yet", "Log your first transaction...") and no emoji in the app chrome.
- Focus ring visible on every control tested; one H1 per page; language switch on the login.

---

## 7. Questions for the owner (taste decides)

1. Vocabulary: do you want **Profit** (not P/L, Return, Performance, Growth) and **Holdings value** (not Invested, Position)? And "Transaction" vs "Purchase / Sale / Deposit"?
2. Should the home hero carry **one sentence** of story (I1/I2) even if it means dropping "Still invested / Already sold" from the hero face?
3. Are you willing to start **daily value snapshots** now so windows (1D, YTD) and "since last visit" can be true? Until then, should those chips be hidden?
4. Is the profile meant to be **part of the home** (goals strip, I5/I6) or a separate "life" area? The data says home; the current navigation says separate.
5. Onboarding: are you prepared to cut to three questions and push the rest to Demographics, even if it means less data on day one?
6. Guest demo: should it include a **full profile** (a home, income, a goal), at the cost of a heavier demo?
7. Tone for risk: are statements like "54% of what you own is technology" acceptable without advice, or must they stay purely descriptive?
8. A buy with no money behind it: auto-create the deposit, ask, or block?
9. Inflation: default to **showing both** (before and after) in the hero instead of the switch?
10. Should the app say the yield assumption (6%) aloud on Home, or only in the Second Salary card?
