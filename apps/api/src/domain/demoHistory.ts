import { cashBalances, moneyPutIn, totalCash, type CashEntry } from './cashLedger';
import { DEMO_REFERENCE_INDEX } from './demoPortfolio';
import type { PortfolioSnapshot } from './portfolioSnapshots';

/**
 * DEMO ONLY. Real accounts have a history only from the day they sign up, because only readings really taken are kept. A demo
 * guest is created fresh and lives an hour, so it would show an empty chart. This builds an illustrative history for it instead:
 * the cash and money put in are replayed exactly from the demo's transactions, and each holding is valued along a smooth,
 * deterministic price path that passes through the price of every purchase and ends at today's price. Nothing here is a real quote.
 */

/** A purchase or sale of the demo, with the part that moves cash and the part that places it in time. */
export interface DemoLedgerEntry extends CashEntry {
  readonly symbol: string;
  readonly quantity: number;
  readonly assetClass: string;
  readonly sector: string;
  readonly date: Date;
}

export interface DemoHistoryInput {
  readonly ledger: readonly DemoLedgerEntry[];
  /** The currency every amount and price is in. */
  readonly currency: string;
  /** What one unit of each currency is worth in euros: the table every conversion of cash uses. */
  readonly eurValue: Readonly<Record<string, number>>;
  /** The last day of the history, "YYYY-MM-DD" (yesterday: today's own reading is taken live). */
  readonly endDay: string;
  /** What one unit of each holding is worth on the end day; a holding missing here stays at its last purchase price. */
  readonly endPrices: Readonly<Record<string, number>>;
  /** What one unit of the world-index fund is worth on the end day. */
  readonly indexEndPrice: number;
}

/** One reading a day for this long before the end, one a week before that. */
const DAILY_DAYS = 60;
const WEEK = 7;
const MS_PER_DAY = 86_400_000;

const dayNumber = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / MS_PER_DAY;
const dayOf = (number: number): string => new Date(number * MS_PER_DAY).toISOString().slice(0, 10);
const cents = (value: number) => Math.round(value * 100) / 100;

/** The days the history has a reading for: weekly from the start, then every day for the last two months, always ending on `endDay`. */
export function demoHistoryDays(startDay: string, endDay: string): string[] {
  const start = dayNumber(startDay);
  const end = dayNumber(endDay);
  if (start > end) return [];
  const days = new Set<number>([start, end]);
  const firstDaily = end - (DAILY_DAYS - 1);
  for (let day = start; day < firstDaily; day += WEEK) days.add(day);
  for (let day = Math.max(start, firstDaily); day <= end; day += 1) days.add(day);
  return [...days].sort((a, b) => a - b).map(dayOf);
}

/** A stable number in [0, 1) from a name: the only "randomness" in the demo, so the same instrument always wobbles the same way. */
function unitFromName(name: string): number {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash / 2 ** 32;
}

export interface PriceAnchor {
  readonly day: number;
  readonly price: number;
}

/**
 * A price for every day, passing exactly through each anchor. Between two anchors it moves at a steady rate with a gentle,
 * deterministic wobble that fades to nothing at both ends; before the first and after the last it holds still. Always positive.
 */
export function demoPricePath(anchors: readonly PriceAnchor[], volatility: number, name: string): (day: number) => number {
  const byDay = new Map<number, number>();
  for (const anchor of [...anchors].sort((a, b) => a.day - b.day)) byDay.set(anchor.day, anchor.price);
  const points = [...byDay.entries()].map(([day, price]) => ({ day, price }));
  if (points.length === 0) return () => 0;

  const phaseA = unitFromName(`${name}:a`) * 2 * Math.PI;
  const phaseB = unitFromName(`${name}:b`) * 2 * Math.PI;
  const wave = (day: number) => 0.6 * Math.sin((2 * Math.PI * day) / 41 + phaseA) + 0.4 * Math.sin((2 * Math.PI * day) / 97 + phaseB);

  return (day) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (day <= first.day) return first.price;
    if (day >= last.day) return last.price;
    const next = points.findIndex((point) => point.day >= day);
    const from = points[next - 1];
    const to = points[next];
    const progress = (day - from.day) / (to.day - from.day);
    const drift = Math.log(from.price) + (Math.log(to.price) - Math.log(from.price)) * progress;
    return Math.exp(drift + volatility * Math.sin(Math.PI * progress) * wave(day));
  };
}

/** How much an instrument wobbles around its trend: coins a lot, single companies some, broad funds little, short bonds hardly. */
const volatilityOf = (assetClass: string, sector: string): number => {
  if (assetClass === 'Cryptocurrency') return 0.18;
  if (assetClass === 'Fixed Income') return 0.004;
  return sector === 'Diversified' ? 0.035 : 0.07;
};

const INDEX_VOLATILITY = 0.03;

const dayOfEntry = (entry: DemoLedgerEntry): number => dayNumber(entry.date.toISOString().slice(0, 10));

/**
 * The illustrative readings of one demo guest, oldest first. Pure: the end day, the end prices and the exchange table arrive as
 * arguments. On any day, cash and money put in are exactly what the transactions so far say (the same rules as the live figures),
 * so the last reading agrees with the live ones when the end prices are today's.
 */
export function demoSnapshotHistory(input: DemoHistoryInput): PortfolioSnapshot[] {
  const endNumber = dayNumber(input.endDay);
  const ledger = input.ledger.filter((entry) => dayOfEntry(entry) <= endNumber).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (ledger.length === 0) return [];

  const startDay = ledger[0].date.toISOString().slice(0, 10);
  const paths = new Map<string, (day: number) => number>();
  for (const symbol of new Set(ledger.filter((entry) => entry.type === 'BOUGHT' || entry.type === 'SOLD').map((entry) => entry.symbol))) {
    const trades = ledger.filter((entry) => entry.symbol === symbol && (entry.type === 'BOUGHT' || entry.type === 'SOLD') && entry.quantity > 0);
    const anchors: PriceAnchor[] = trades.map((entry) => ({ day: dayOfEntry(entry), price: entry.amount / entry.quantity }));
    const endPrice = input.endPrices[symbol];
    if (endPrice !== undefined && Number.isFinite(endPrice) && endPrice > 0) anchors.push({ day: endNumber, price: endPrice });
    paths.set(symbol, demoPricePath(anchors, volatilityOf(trades[0].assetClass, trades[0].sector), symbol));
  }
  const indexPath = demoPricePath(
    [
      { day: dayNumber(startDay), price: DEMO_REFERENCE_INDEX.startPrice },
      { day: endNumber, price: input.indexEndPrice },
    ],
    INDEX_VOLATILITY,
    'world-index'
  );

  const applied: DemoLedgerEntry[] = [];
  const held = new Map<string, number>();
  let next = 0;

  return demoHistoryDays(startDay, input.endDay).map((day): PortfolioSnapshot => {
    const today = dayNumber(day);
    while (next < ledger.length && dayOfEntry(ledger[next]) <= today) {
      const entry = ledger[next];
      applied.push(entry);
      if (entry.type === 'BOUGHT') held.set(entry.symbol, (held.get(entry.symbol) ?? 0) + entry.quantity);
      if (entry.type === 'SOLD') held.set(entry.symbol, (held.get(entry.symbol) ?? 0) - entry.quantity);
      next += 1;
    }
    let holdings = 0;
    for (const [symbol, quantity] of held) if (quantity > 1e-9) holdings += quantity * (paths.get(symbol)?.(today) ?? 0);
    const cash = totalCash(cashBalances(applied), input.currency, input.eurValue);

    return {
      day,
      currency: input.currency,
      totalValue: cents(cash + holdings),
      holdingsValue: cents(holdings),
      cash: cents(cash),
      moneyPutIn: cents(moneyPutIn(applied)),
      benchmarkPrice: Math.round(indexPath(today) * 10_000) / 10_000,
    };
  });
}
