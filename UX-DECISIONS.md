# UX decisions (from UX-REVIEW.md, agreed with the owner)

Goal: move the app from about 24/40 to more than 35/40 on the same review. Re-run the review at the end and compare.
Rules that apply to every item: plain language, describe and never advise, one vocabulary (below), English and Spanish (es-AR) together, tests first for logic, no new clutter (every addition names what it replaces).

## 1. Sign-in
- Google is the only way to create an account (no Apple, Microsoft or GitHub). The login has no email field.
- Passkeys stay as an optional extra: a signed-in person can add one in their profile, then sign in with it next time. No passkey sign-up from the login screen. Remove the hardcoded `juan@portfolio.local` fallback. The administrator keeps signing in with Google only.
- Login wording: headline "See everything you own in one calm place"; trust line "No passwords. No problems."; guest button "Try the demo" (no emoji); page title "Portfolio Tracker" on every screen.
- Open risk: Google may refuse the ts.net address. Test at the Tailscale step. Fallback: passkeys that need no email.

## 2. Numbers you can trust
- Start saving a daily value snapshot now. Until a period has real history, hide the 1D / 1W / MTD / YTD style windows and the growth-over-time line; show "Since you started" only. Windows appear when real data exists.
- Hero: "Invested" becomes "Holdings value"; one agreed cash figure everywhere; no cents above 1,000 (hero and phase card); drop the "What you own today" line; a brand-new account does not show "0.00% since you started".
- Growth chart: one line plus the world-index benchmark by default, labelled in words; dates like "Mar 2024", no repeated labels. The Performance bar chart is removed until it can be true.
- Period chips: six (All, 1Y, YTD, 3M, 1M, Custom), each shown only with real history behind it.

## 3. Money model (owner rule)
- A buy never touches cash: the amount counts as money put in. Cash can never go negative from a buy. Cash changes only through Deposit, Withdraw, sale proceeds (which go into Cash automatically) and the cash the person holds.
- Watch-out: reinvesting sale proceeds leaves cash overstated until a Withdraw is logged. Decide the "pay with my cash" tick when building.

## 4. First 10 minutes
- Onboarding cut to three questions: country and city, "How much do you earn each month, after tax?" (optional), "What is your rent?". Everything else moves to "Tell us more later" in Demographics. The profile is offered after the first purchase.
- Polish, all: live "what we know" line while typing; the Bills step reuses the Add expense wizard; fix wording ("What came in each month?", "Which city was it?"); prefill the name from the greeting and drop year of birth; reopen the dialog on the same step after a refresh; offer the next step after Finish; toast after a bill ("You now keep 67%, was 69%").
- New account Home: one card "Add your first purchase" (form inline) with a line offering the profile; no period chips, empty chart or legend until there is data.
- Not now: buy form helpers (live price, auto-tagging, first-value line); data check banner (I7).

## 5. Insights on Home
- I1 + I2: one story sentence under Total profit replaces "Still invested / Already sold" (the split stays in "How this adds up"): top contributors, one detractor, and the world-index comparison only after 12 months of history.
- I11: show "before inflation" and "after inflation" under profit (only when the portfolio is over a year old, with source and date). The header switch stays.
- Panels: Concentration (I9) and Idle cash and inflation (I8). Thresholds from the report. Tone: describe, never advise, no red for risk.
- Goals strip on Home (I5 + I6): what you keep, what the portfolio could pay at a stated 6%, time to one goal. No profile: one prompt, never 0.
- Profile card: "Saved 69%" becomes "Left after fixed costs" plus the trend sentence (I3); remove the extrapolated totals ("Fixed costs paid", "Earned").
- "Where you stand": compare renters with renters (omit the sentence if there is no data), merge the repeated EU line, add "of people in Spain" to "Top 11%".
- Not now: I4 (what your savings did), I10 (since you last looked; snapshots still start).

## 6. Tables, forms, header, profile, demo
- Holdings: 4 columns by default (name, value, profit in money and %, share of portfolio); rename Position to Units, Holding period to Held ("6.8 years"), Net cash invested to "What you paid", MWR to "Yearly return"; "per year" only after a year held; a sold holding shows "Sold" once.
- Log Transaction: hide asset class, sector and region on Sold until a holding is picked; clearer labels ("Total amount paid", hint inside the search box); currency icon matching the person's currency. No Dividend option for now (dividends stay as deposits).
- Header: chip "Inflation: Spain"; profile gets a visible label; sign-out asks once.
- Profile page: current job as a visible row with a real "Add job" button; deleting a home always asks.
- Guest demo: full profile (home, income, bills, two goals), ON in production. Required with it: visitors cannot change what other visitors see, and demo sign-in is rate-limited.

## 7. Mobile, accessibility, vocabulary
- Mobile: Holdings as cards under 700px; no sideways scroll; every control at least 44px; labels back on the mobile header.
- Accessibility: smallest text 13px; table sub-header contrast to AA; skip link; text summary for the chart.
- Glossary (EN and es-AR): Profit (never P/L, Return, Performance, Growth); Holdings value (never Invested); Money you put in; Units; Held; What you paid; Yearly return; Share of portfolio; transaction types as verbs Buy, Sell, Deposit, Withdraw; one asset-class list (Stock, ETF, Crypto, Bond, Real Estate) in the form and the filter, "Crypto" no longer also a sector.
- Quick wins also applied: visible "?" help for Net contributions and Benchmark; negative money in one format and colour ("-€1,800"); skip link.
- Keep (protect with tests where possible): calm black look, two-figure hero, "How this adds up", "Where you stand" hierarchy, PDF bill reading with three-step review, sale form with Available and MAX, honest empty copy, visible focus ring.
