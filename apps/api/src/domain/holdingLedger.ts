import { InsufficientHoldingsError } from './errors';

export interface LedgerEntry {
  readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  readonly symbol: string;
  readonly quantity: number;
  readonly date: Date;
}

/** Quantities are floats (0.1 + 0.2): anything below this is dust, not a unit. */
const UNIT_PRECISION = 1e8;
/** `+ 0` turns a rounded -0 into 0. */
const roundUnits = (units: number) => Math.round(units * UNIT_PRECISION) / UNIT_PRECISION + 0;

const signedUnits = (entry: LedgerEntry): number => (entry.type === 'BOUGHT' ? entry.quantity : entry.type === 'SOLD' ? -entry.quantity : 0);
const isOf = (symbol: string) => (entry: LedgerEntry) => entry.symbol.toUpperCase() === symbol.toUpperCase() && (entry.type === 'BOUGHT' || entry.type === 'SOLD');

/** Units of an instrument held at the end of `asOf`, replayed from the ledger of what was bought and sold. */
export function availableUnits(entries: readonly LedgerEntry[], symbol: string, asOf: Date): number {
  return roundUnits(
    entries
      .filter(isOf(symbol))
      .filter((entry) => entry.date.getTime() <= asOf.getTime())
      .reduce((units, entry) => units + signedUnits(entry), 0)
  );
}

/**
 * A sale is covered when, with it added to the ledger, the holding never goes below zero on any date:
 * not on the sale date, and not at a later sale a back-dated one would starve.
 */
export function assertSaleCovered(entries: readonly LedgerEntry[], symbol: string, quantity: number, date: Date): void {
  const heldOnDate = availableUnits(entries, symbol, date);
  if (!(quantity > 0) || quantity > heldOnDate) throw new InsufficientHoldingsError(symbol.toUpperCase(), quantity, heldOnDate);

  const withSale: LedgerEntry[] = [...entries, { type: 'SOLD', symbol, quantity, date }];
  const timeline = withSale
    .filter(isOf(symbol))
    .map((entry, index) => ({ entry, index }))
    // On one instant, buys come first: a purchase and a sale logged together are in that order.
    .sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime() || signedUnits(b.entry) - signedUnits(a.entry) || a.index - b.index);

  let running = 0;
  for (const { entry } of timeline) {
    running = roundUnits(running + signedUnits(entry));
    if (running < 0) throw new InsufficientHoldingsError(symbol.toUpperCase(), quantity, heldOnDate);
  }
}
