import { InsufficientCashError, InsufficientHoldingsError, TransactionRequiredByLaterError } from '../domain/errors';
import { amendedRow, assertAmendmentAllowed, earliestAffectedDay, ledgerViolations, rebuildInstrument, type LedgerRow } from '../domain/ledgerAmendment';

let counter = 0;
const day = (value: string) => new Date(`${value}T00:00:00Z`);

function row(extra: Partial<LedgerRow>): LedgerRow {
  counter += 1;
  return {
    id: `t${counter}`,
    type: 'BOUGHT',
    symbol: 'AAPL',
    name: 'Apple',
    assetClass: 'Stock',
    region: 'North America',
    sector: 'Technology',
    quantity: 10,
    amount: 1000,
    fee: 0,
    totalAmount: 1000,
    currency: 'EUR',
    notes: null,
    date: day('2026-01-05'),
    paidWithCash: false,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)),
    ...extra,
  };
}
const buy = (quantity: number, amount: number, date: string, extra: Partial<LedgerRow> = {}) => row({ type: 'BOUGHT', quantity, amount, date: day(date), ...extra });
const sell = (quantity: number, amount: number, date: string, extra: Partial<LedgerRow> = {}) => row({ type: 'SOLD', quantity, amount, date: day(date), ...extra });
const deposit = (amount: number, date: string, extra: Partial<LedgerRow> = {}) =>
  row({ type: 'DEPOSIT', symbol: 'CASH', name: 'Cash Operation', assetClass: 'Cash', quantity: 1, amount, date: day(date), ...extra });

describe('rebuildInstrument: the position and the profit locked in are what the ledger says', () => {
  it('opens at the first buy, grows with the next one and takes only its share of the cost with a sale', () => {
    const ledger = [buy(10, 1000, '2026-01-05'), buy(5, 750, '2026-02-01'), sell(6, 900, '2026-03-01', { fee: 3 })];

    const { position, gains } = rebuildInstrument(ledger, 'AAPL');

    // 15 units cost 1,750; the 6 sold carry 700 of it away.
    expect(position).toMatchObject({ symbol: 'AAPL', quantity: 9, investedAmount: 1050, createdAt: day('2026-01-05') });
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ symbol: 'AAPL', investedAmount: 700, returnedAmount: 900, realizedPnl: 197, date: day('2026-03-01'), createdAt: day('2026-01-05') });
  });

  it('ignores the order the rows are given in: the dates decide, and a buy comes before a sale of the same day', () => {
    const ledger = [sell(4, 500, '2026-02-01'), buy(10, 1000, '2026-02-01')];

    const { position, gains } = rebuildInstrument(ledger, 'AAPL');

    expect(position).toMatchObject({ quantity: 6, investedAmount: 600 });
    expect(gains[0].realizedPnl).toBe(100);
  });

  it('has no position once everything is sold, and a new one that starts fresh when it is bought again', () => {
    const closed = rebuildInstrument([buy(10, 1000, '2026-01-05'), sell(10, 1200, '2026-02-01')], 'AAPL');
    expect(closed.position).toBeNull();
    expect(closed.gains).toHaveLength(1);

    const reopened = rebuildInstrument([buy(10, 1000, '2026-01-05'), sell(10, 1200, '2026-02-01'), buy(2, 300, '2026-04-01')], 'AAPL');
    expect(reopened.position).toMatchObject({ quantity: 2, investedAmount: 300, createdAt: day('2026-04-01') });
    expect(reopened.gains).toHaveLength(1);
  });

  it('looks only at its own instrument, and not at cash operations', () => {
    const ledger = [buy(10, 1000, '2026-01-05'), buy(3, 90, '2026-01-06', { symbol: 'MSFT' }), deposit(500, '2026-01-07')];

    expect(rebuildInstrument(ledger, 'aapl').position).toMatchObject({ symbol: 'AAPL', quantity: 10 });
    expect(rebuildInstrument(ledger, 'NVDA')).toEqual({ symbol: 'NVDA', position: null, gains: [] });
  });
});

describe('ledgerViolations: where the ledger stops adding up', () => {
  it('finds nothing in a ledger that is covered', () => {
    const ledger = [deposit(2000, '2026-01-01'), buy(10, 1000, '2026-01-05', { paidWithCash: true }), sell(4, 600, '2026-02-01')];

    expect(ledgerViolations(ledger)).toEqual([]);
  });

  it('finds a sale of units not held on its date', () => {
    const early = sell(5, 600, '2026-01-01');
    const ledger = [early, buy(10, 1000, '2026-01-05')];

    expect(ledgerViolations(ledger)).toMatchObject([{ kind: 'HOLDINGS', row: { id: early.id }, available: 0, requested: 5 }]);
  });

  it('finds a purchase paid with cash that was not in the account on its date, even if the money arrives later', () => {
    const early = buy(10, 1000, '2026-01-05', { paidWithCash: true });
    const ledger = [early, deposit(2000, '2026-02-01')];

    expect(ledgerViolations(ledger)).toMatchObject([{ kind: 'CASH', row: { id: early.id }, currency: 'EUR', requested: 1000, available: 0 }]);
  });

  it('counts the proceeds of a sale and a deposit of the same day as cash in hand for a purchase that day', () => {
    const ledger = [buy(10, 1000, '2026-01-01'), sell(10, 1100, '2026-02-01'), buy(2, 300, '2026-02-01', { symbol: 'MSFT', paidWithCash: true }), deposit(200, '2026-02-01')];

    expect(ledgerViolations(ledger)).toEqual([]);
  });

  it('checks cash currency by currency', () => {
    const usdBuy = buy(1, 100, '2026-01-05', { paidWithCash: true, currency: 'USD' });
    const ledger = [deposit(5000, '2026-01-01'), usdBuy];

    expect(ledgerViolations(ledger)).toMatchObject([{ kind: 'CASH', currency: 'USD', row: { id: usdBuy.id } }]);
  });
});

describe('assertAmendmentAllowed: a change is refused when it leaves the ledger broken', () => {
  it('lets a harmless change through', () => {
    const first = buy(10, 1000, '2026-01-05');
    const before = [first, sell(4, 600, '2026-02-01')];

    expect(() => assertAmendmentAllowed(before, [amendedRow(first, { amount: 1100 }), before[1]], first.id)).not.toThrow();
  });

  it('refuses to sell more than was held, saying how many could be sold', () => {
    const first = buy(10, 1000, '2026-01-05');
    const sale = sell(4, 600, '2026-02-01');
    const after = [first, amendedRow(sale, { quantity: 12 })];

    expect(() => assertAmendmentAllowed([first, sale], after, sale.id)).toThrow(InsufficientHoldingsError);
    try {
      assertAmendmentAllowed([first, sale], after, sale.id);
    } catch (error) {
      expect(error).toMatchObject({ code: 'INSUFFICIENT_HOLDINGS', availableUnits: 10, requestedUnits: 12 });
    }
  });

  it('refuses to delete a purchase that a later sale relies on, naming that sale', () => {
    const first = buy(10, 1000, '2026-01-05');
    const sale = sell(4, 600, '2026-02-01');

    expect(() => assertAmendmentAllowed([first, sale], [sale], first.id)).toThrow(TransactionRequiredByLaterError);
    try {
      assertAmendmentAllowed([first, sale], [sale], first.id);
    } catch (error) {
      expect(error).toMatchObject({ code: 'TRANSACTION_REQUIRED_BY_LATER', dependent: { id: sale.id, type: 'SOLD', symbol: 'AAPL', date: '2026-02-01' } });
    }
  });

  it('refuses to move a purchase to after the sale that needs it', () => {
    const first = buy(10, 1000, '2026-01-05');
    const sale = sell(4, 600, '2026-02-01');

    expect(() => assertAmendmentAllowed([first, sale], [amendedRow(first, { date: day('2026-03-01') }), sale], first.id)).toThrow(TransactionRequiredByLaterError);
  });

  it('refuses to delete the deposit that paid for a later cash purchase, naming the purchase', () => {
    const money = deposit(2000, '2026-01-01');
    const purchase = buy(10, 1000, '2026-01-05', { paidWithCash: true });

    try {
      assertAmendmentAllowed([money, purchase], [purchase], money.id);
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionRequiredByLaterError);
      expect(error).toMatchObject({ dependent: { id: purchase.id, type: 'BOUGHT', date: '2026-01-05' } });
    }
  });

  it('refuses to delete the sale whose proceeds paid for a later cash purchase', () => {
    const first = buy(10, 1000, '2026-01-01');
    const sale = sell(10, 1200, '2026-02-01');
    const purchase = buy(1, 1100, '2026-02-10', { symbol: 'MSFT', paidWithCash: true });

    expect(() => assertAmendmentAllowed([first, sale, purchase], [first, purchase], sale.id)).toThrow(TransactionRequiredByLaterError);
  });

  it('refuses a cash purchase edited to cost more than the cash held, with the cash that is there', () => {
    const money = deposit(1500, '2026-01-01');
    const purchase = buy(10, 1000, '2026-01-05', { paidWithCash: true });

    try {
      assertAmendmentAllowed([money, purchase], [money, amendedRow(purchase, { amount: 1800 })], purchase.id);
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientCashError);
      expect(error).toMatchObject({ currency: 'EUR', availableMinor: 150000 });
    }
  });

  it('does not blame a change for a break that was already there', () => {
    const early = sell(5, 600, '2026-01-01');
    const first = buy(10, 1000, '2026-01-05');
    const before = [early, first];

    expect(() => assertAmendmentAllowed(before, [early, amendedRow(first, { fee: 2 })], first.id)).not.toThrow();
  });
});

describe('amendedRow: what a correction keeps and what it recalculates', () => {
  it('takes the corrected fields and recalculates the total with the fee: a buy adds it, other types take it off', () => {
    const purchase = buy(10, 1000, '2026-01-05', { fee: 2, totalAmount: 1002 });
    const sale = sell(5, 700, '2026-02-01', { fee: 3, totalAmount: 697 });

    expect(amendedRow(purchase, { amount: 1200, fee: 5 })).toMatchObject({ amount: 1200, fee: 5, totalAmount: 1205, quantity: 10 });
    expect(amendedRow(sale, { quantity: 4, fee: 1 })).toMatchObject({ quantity: 4, fee: 1, totalAmount: 699, amount: 700 });
  });

  it('never changes what was traded or its currency, and only a buy can be paid with cash', () => {
    const money = deposit(500, '2026-01-01');
    const sale = sell(5, 700, '2026-02-01');

    expect(amendedRow(sale, { paidWithCash: true }).paidWithCash).toBe(false);
    expect(amendedRow(money, { quantity: 9 }).quantity).toBe(1);
    const changed = amendedRow(buy(10, 1000, '2026-01-05'), { date: day('2026-01-09'), notes: 'fixed' });
    expect(changed).toMatchObject({ symbol: 'AAPL', type: 'BOUGHT', currency: 'EUR', date: day('2026-01-09'), notes: 'fixed' });
  });
});

describe('earliestAffectedDay', () => {
  it('is the older of the two dates when a transaction moves, and its own date when it is removed', () => {
    const purchase = buy(10, 1000, '2026-03-05');

    expect(earliestAffectedDay(purchase, amendedRow(purchase, { date: day('2026-02-01') }))).toEqual(day('2026-02-01'));
    expect(earliestAffectedDay(purchase, amendedRow(purchase, { date: day('2026-04-01') }))).toEqual(day('2026-03-05'));
    expect(earliestAffectedDay(purchase, null)).toEqual(day('2026-03-05'));
  });
});
