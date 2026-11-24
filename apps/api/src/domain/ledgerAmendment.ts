import { cashEffect, HALF_CENT, type CashEntry } from './cashLedger';
import { InsufficientCashError, InsufficientHoldingsError, TransactionRequiredByLaterError } from './errors';
import { roundUnits } from './holdingLedger';
import { planTransaction, totalAmountOf, type NewPosition, type NewRealizedGain, type PositionChange, type TransactionCommand } from './transactionPlan';

/** One transaction of the ledger, as stored. */
export interface LedgerRow extends CashEntry {
  readonly id: string;
  readonly symbol: string;
  readonly name: string | null;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly totalAmount: number;
  readonly date: Date;
  readonly createdAt: Date;
}

/** What a person may correct in a transaction. What was traded, its kind and its currency never change: remove it and log it again. */
export interface TransactionChange {
  readonly date?: Date;
  readonly quantity?: number;
  readonly amount?: number;
  readonly fee?: number;
  readonly paidWithCash?: boolean;
  readonly notes?: string;
}

/** The transaction with the correction applied; the total is recalculated, and a field that means nothing for its kind is left alone. */
export function amendedRow(row: LedgerRow, change: TransactionChange): LedgerRow {
  const tradesUnits = row.type === 'BOUGHT' || row.type === 'SOLD';
  const amount = change.amount ?? row.amount;
  const fee = change.fee ?? row.fee;
  return {
    ...row,
    date: change.date ?? row.date,
    quantity: tradesUnits ? (change.quantity ?? row.quantity) : row.quantity,
    amount,
    fee,
    paidWithCash: row.type === 'BOUGHT' ? (change.paidWithCash ?? row.paidWithCash) : false,
    notes: change.notes ?? row.notes,
    totalAmount: totalAmountOf(row.type, amount, fee),
  };
}

/** The oldest day a change reaches: every stored reading from then on describes a ledger that no longer exists. */
export const earliestAffectedDay = (before: LedgerRow, after: LedgerRow | null): Date =>
  after && after.date.getTime() < before.date.getTime() ? after.date : before.date;

const time = (row: LedgerRow) => row.date.getTime();
const bySequence = (a: LedgerRow, b: LedgerRow) => a.createdAt.getTime() - b.createdAt.getTime();
const isTrade = (row: LedgerRow) => row.type === 'BOUGHT' || row.type === 'SOLD';
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
/** On one instant a purchase comes before a sale: what is bought and sold the same day is in that order. */
const buysFirst = (a: LedgerRow, b: LedgerRow) => Number(b.type === 'BOUGHT') - Number(a.type === 'BOUGHT');

/** A point where the ledger stops adding up: a sale of units not held, or a purchase paid with cash that was not there. */
export type Violation =
  | { readonly kind: 'HOLDINGS'; readonly row: LedgerRow; readonly symbol: string; readonly requested: number; readonly available: number }
  | { readonly kind: 'CASH'; readonly row: LedgerRow; readonly currency: string; readonly requested: number; readonly available: number };

const keyOf = (violation: Violation) => `${violation.kind}:${violation.row.id}`;

function groupBy(rows: readonly LedgerRow[], keyOfRow: (row: LedgerRow) => string): Map<string, LedgerRow[]> {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) groups.set(keyOfRow(row), [...(groups.get(keyOfRow(row)) ?? []), row]);
  return groups;
}

function holdingViolations(rows: readonly LedgerRow[]): Violation[] {
  const found: Violation[] = [];
  for (const [symbol, trades] of groupBy(rows.filter(isTrade), (row) => row.symbol.toUpperCase())) {
    const timeline = [...trades].sort((a, b) => time(a) - time(b) || buysFirst(a, b) || bySequence(a, b));
    let running = 0;
    for (const row of timeline) {
      if (row.type === 'BOUGHT') {
        running = roundUnits(running + row.quantity);
        continue;
      }
      const available = Math.max(0, running);
      running = roundUnits(running - row.quantity);
      if (running < 0) found.push({ kind: 'HOLDINGS', row, symbol, requested: row.quantity, available });
    }
  }
  return found;
}

function cashViolations(rows: readonly LedgerRow[]): Violation[] {
  const found: Violation[] = [];
  for (const [currency, entries] of groupBy(rows, (row) => row.currency.toUpperCase())) {
    // On one instant what brings cash in comes before what takes it out.
    const timeline = [...entries].sort((a, b) => time(a) - time(b) || Number(cashEffect(b) >= 0) - Number(cashEffect(a) >= 0) || bySequence(a, b));
    let running = 0;
    for (const row of timeline) {
      running += cashEffect(row);
      if (row.type === 'BOUGHT' && row.paidWithCash && running < -HALF_CENT) {
        const requested = row.amount + row.fee;
        found.push({ kind: 'CASH', row, currency, requested, available: Math.max(0, running + requested) });
      }
    }
  }
  return found;
}

/** Everything wrong with a ledger, replayed in date order. */
export const ledgerViolations = (rows: readonly LedgerRow[]): Violation[] => [...holdingViolations(rows), ...cashViolations(rows)];

/**
 * A change (or a removal: `amendedId` is then missing from `after`) is allowed when it breaks nothing that held before.
 * Something already broken by older data is not blamed on the change. When the changed transaction is itself the one that no
 * longer holds, the usual refusal is raised (not enough units, not enough cash); when a later transaction depends on it, that one is named.
 */
export function assertAmendmentAllowed(before: readonly LedgerRow[], after: readonly LedgerRow[], amendedId: string): void {
  const known = new Set(ledgerViolations(before).map(keyOf));
  const fresh = ledgerViolations(after).filter((violation) => !known.has(keyOf(violation)));
  if (fresh.length === 0) return;

  const own = fresh.find((violation) => violation.row.id === amendedId);
  if (own?.kind === 'HOLDINGS') throw new InsufficientHoldingsError(own.symbol, own.requested, own.available);
  if (own?.kind === 'CASH') throw new InsufficientCashError(own.currency, own.requested, own.available);

  const [dependent] = [...fresh].sort((a, b) => time(a.row) - time(b.row));
  throw new TransactionRequiredByLaterError({ id: dependent.row.id, type: dependent.row.type, symbol: dependent.row.symbol, date: dayOf(dependent.row.date) });
}

/** What is left of one instrument once its whole history is replayed: the position still held and the profit each sale locked in. */
export interface RebuiltInstrument {
  readonly symbol: string;
  readonly position: NewPosition | null;
  readonly gains: readonly NewRealizedGain[];
}

const commandOf = (row: LedgerRow): TransactionCommand => ({
  type: row.type,
  symbol: row.symbol.toUpperCase(),
  name: row.name ?? row.symbol.toUpperCase(),
  assetClass: row.assetClass,
  region: row.region,
  sector: row.sector,
  quantity: row.quantity,
  amount: row.amount,
  fee: row.fee,
  currency: row.currency,
  notes: row.notes ?? undefined,
  date: row.date,
  paidWithCash: row.paidWithCash,
});

function applied(held: NewPosition | null, change: PositionChange | null): NewPosition | null {
  if (!change) return held;
  if (change.kind === 'open') return change.data;
  if (change.kind === 'close' || !held) return null;
  return { ...held, quantity: change.quantity, investedAmount: change.investedAmount };
}

/**
 * Replays the purchases and sales of one instrument through the same rules a single transaction follows (`planTransaction`), so a
 * ledger rebuilt after a correction ends exactly where the same ledger recorded in order would have.
 */
export function rebuildInstrument(rows: readonly LedgerRow[], symbol: string): RebuiltInstrument {
  const wanted = symbol.toUpperCase();
  const history = rows
    .filter((row) => isTrade(row) && row.symbol.toUpperCase() === wanted)
    .sort((a, b) => time(a) - time(b) || buysFirst(a, b) || bySequence(a, b));

  let held: NewPosition | null = null;
  const gains: NewRealizedGain[] = [];
  for (const row of history) {
    const openedAt = held?.createdAt ?? row.date;
    const plan = planTransaction(commandOf(row), held ? { id: 'rebuilt', quantity: held.quantity, investedAmount: held.investedAmount } : null);
    if (plan.realizedGain) gains.push({ ...plan.realizedGain, createdAt: openedAt });
    held = applied(held, plan.position);
  }
  return { symbol: wanted, position: held, gains };
}
