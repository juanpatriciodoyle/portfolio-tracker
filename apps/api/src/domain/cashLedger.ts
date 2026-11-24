import { InsufficientCashError } from './errors';

/** The part of a transaction that moves cash or the money a person put in. */
export interface CashEntry {
  readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  readonly amount: number;
  readonly fee: number;
  readonly currency: string;
  /** Only meaningful for a buy: true when the purchase drew on the cash the person holds. */
  readonly paidWithCash: boolean;
  readonly notes?: string | null;
}

/** Amounts are floats: anything within half a cent counts as equal. */
export const HALF_CENT = 0.005;

/** A deposit marked as a dividend is something the holdings earned, not something the person put in. */
export const isDividend = (entry: Pick<CashEntry, 'type' | 'notes'>): boolean =>
  entry.type === 'DEPOSIT' && (entry.notes ?? '').toLowerCase().includes('dividend');

/**
 * What one transaction does to cash. A buy never touches it unless the person said it was paid with cash;
 * a sale always brings its proceeds in. Cash therefore moves only through these rules, and the ledger alone tells the balance.
 */
export function cashEffect(entry: CashEntry): number {
  switch (entry.type) {
    case 'DEPOSIT':
      return entry.amount;
    case 'WITHDRAWAL':
      return -entry.amount;
    case 'BOUGHT':
      return entry.paidWithCash ? -(entry.amount + entry.fee) : 0;
    case 'SOLD':
      return entry.amount - entry.fee;
  }
}

/** What one transaction does to the money the person put in: new money is what was not already in the portfolio. */
export function moneyPutInEffect(entry: CashEntry): number {
  switch (entry.type) {
    case 'DEPOSIT':
      return isDividend(entry) ? 0 : entry.amount;
    case 'WITHDRAWAL':
      return -entry.amount;
    case 'BOUGHT':
      return entry.paidWithCash ? 0 : entry.amount + entry.fee;
    case 'SOLD':
      return 0;
  }
}

/** Money put in minus money taken out; dividends are not part of it. The one denominator of every return percentage. */
export const moneyPutIn = (entries: readonly CashEntry[]): number => entries.reduce((sum, entry) => sum + moneyPutInEffect(entry), 0);

export const dividendsReceived = (entries: readonly CashEntry[]): number =>
  entries.filter(isDividend).reduce((sum, entry) => sum + entry.amount, 0);

/** Cash held in each currency (upper-case code), replayed from the ledger. A currency never touched is absent. */
export function cashBalances(entries: readonly CashEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const entry of entries) {
    const effect = cashEffect(entry);
    if (effect === 0) continue;
    const currency = entry.currency.toUpperCase();
    balances[currency] = (balances[currency] ?? 0) + effect;
  }
  return balances;
}

/**
 * All the cash as one figure in `reportingCurrency`. `eurValue` says what one unit of each currency is worth in euros;
 * a currency with no rate counts one-to-one rather than dropping the person's money from the total.
 */
export function totalCash(balances: Readonly<Record<string, number>>, reportingCurrency: string, eurValue: Readonly<Record<string, number>>): number {
  const rateOf = (currency: string) => eurValue[currency.toUpperCase()] ?? 1;
  return Object.entries(balances).reduce((sum, [currency, balance]) => sum + (balance * rateOf(currency)) / rateOf(reportingCurrency), 0);
}

/** A purchase paid with cash needs that much cash in its own currency; anything less is refused, never made negative. */
export function assertCashCovers(balances: Readonly<Record<string, number>>, currency: string, needed: number): void {
  const available = balances[currency.toUpperCase()] ?? 0;
  if (needed > available + HALF_CENT) throw new InsufficientCashError(currency.toUpperCase(), needed, available);
}
