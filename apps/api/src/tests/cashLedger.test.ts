import { assertCashCovers, cashBalances, cashEffect, dividendsReceived, moneyPutIn, moneyPutInEffect, totalCash, type CashEntry } from '../domain/cashLedger';
import { InsufficientCashError } from '../domain/errors';

const entry = (type: CashEntry['type'], amount: number, extra: Partial<CashEntry> = {}): CashEntry => ({
  type,
  amount,
  fee: extra.fee ?? 0,
  currency: extra.currency ?? 'EUR',
  paidWithCash: extra.paidWithCash ?? false,
  notes: extra.notes ?? null,
});

describe('cashEffect: what one transaction does to cash', () => {
  it('adds a deposit and takes a withdrawal', () => {
    expect(cashEffect(entry('DEPOSIT', 500))).toBe(500);
    expect(cashEffect(entry('WITHDRAWAL', 200))).toBe(-200);
  });

  it('never touches cash for a buy, however large, unless it was paid with cash', () => {
    expect(cashEffect(entry('BOUGHT', 1800, { fee: 5 }))).toBe(0);
  });

  it('takes the amount and the fee for a buy paid with cash', () => {
    expect(cashEffect(entry('BOUGHT', 1800, { fee: 5, paidWithCash: true }))).toBe(-1805);
  });

  it('always adds the proceeds of a sale, net of its fee', () => {
    expect(cashEffect(entry('SOLD', 1000, { fee: 4 }))).toBe(996);
    expect(cashEffect(entry('SOLD', 1000, { fee: 4, paidWithCash: true }))).toBe(996);
  });
});

describe('moneyPutInEffect: what one transaction does to the money the person put in', () => {
  it('counts a deposit in and a withdrawal out', () => {
    expect(moneyPutInEffect(entry('DEPOSIT', 500))).toBe(500);
    expect(moneyPutInEffect(entry('WITHDRAWAL', 200))).toBe(-200);
  });

  it('counts a buy that was not paid with cash as new money, fee included', () => {
    expect(moneyPutInEffect(entry('BOUGHT', 1800, { fee: 5 }))).toBe(1805);
  });

  it('does not count a buy paid with cash: that money was already in', () => {
    expect(moneyPutInEffect(entry('BOUGHT', 1800, { paidWithCash: true }))).toBe(0);
  });

  it('does not count a sale: its proceeds are the same money coming back', () => {
    expect(moneyPutInEffect(entry('SOLD', 2000))).toBe(0);
  });

  it('does not count a dividend: it is something earned, not something put in', () => {
    expect(moneyPutInEffect(entry('DEPOSIT', 30, { notes: 'Dividend from VUAA' }))).toBe(0);
    expect(moneyPutInEffect(entry('DEPOSIT', 30, { notes: 'DIVIDEND' }))).toBe(0);
  });
});

describe('moneyPutIn and dividendsReceived', () => {
  it('is zero for an empty ledger', () => {
    expect(moneyPutIn([])).toBe(0);
    expect(dividendsReceived([])).toBe(0);
  });

  it('adds deposits and buys with new money, and subtracts withdrawals', () => {
    const ledger = [entry('DEPOSIT', 1000), entry('BOUGHT', 400, { fee: 1 }), entry('BOUGHT', 300, { paidWithCash: true }), entry('WITHDRAWAL', 100)];
    expect(moneyPutIn(ledger)).toBe(1000 + 401 - 100);
  });

  it('sums the dividends separately', () => {
    const ledger = [entry('DEPOSIT', 1000), entry('DEPOSIT', 12.5, { notes: 'dividend' }), entry('DEPOSIT', 7.5, { notes: 'Dividend Q2' })];
    expect(dividendsReceived(ledger)).toBe(20);
    expect(moneyPutIn(ledger)).toBe(1000);
  });
});

describe('cashBalances: cash per currency, from the ledger alone', () => {
  it('is empty without transactions', () => {
    expect(cashBalances([])).toEqual({});
  });

  it('keeps each currency apart and upper-cases the code', () => {
    const balances = cashBalances([entry('DEPOSIT', 100, { currency: 'eur' }), entry('DEPOSIT', 50, { currency: 'USD' }), entry('WITHDRAWAL', 20, { currency: 'USD' })]);
    expect(balances).toEqual({ EUR: 100, USD: 30 });
  });

  it('shows the cash a sale brought in, and the cash a paid-with-cash buy took out', () => {
    const balances = cashBalances([entry('BOUGHT', 1000), entry('SOLD', 1500, { fee: 5 }), entry('BOUGHT', 400, { paidWithCash: true })]);
    expect(balances).toEqual({ EUR: 1495 - 400 });
  });

  it('cannot go negative because of a plain buy', () => {
    expect(cashBalances([entry('BOUGHT', 1800)])).toEqual({});
  });
});

describe('totalCash: one figure in the reporting currency', () => {
  const eurValue = { EUR: 1, USD: 0.5, GBP: 1.2 };

  it('is zero without cash', () => {
    expect(totalCash({}, 'EUR', eurValue)).toBe(0);
  });

  it('converts every currency with the same table and adds them up', () => {
    expect(totalCash({ EUR: 100, USD: 200, GBP: 10 }, 'EUR', eurValue)).toBeCloseTo(100 + 100 + 12, 8);
  });

  it('converts into a reporting currency other than the euro', () => {
    expect(totalCash({ EUR: 100 }, 'USD', eurValue)).toBeCloseTo(200, 8);
  });

  it('treats a currency it has no rate for as one-to-one rather than losing the money', () => {
    expect(totalCash({ XYZ: 40 }, 'EUR', eurValue)).toBe(40);
  });
});

describe('assertCashCovers', () => {
  it('lets a purchase through when the cash in that currency is enough, to the cent', () => {
    expect(() => assertCashCovers({ EUR: 100 }, 'EUR', 100)).not.toThrow();
    expect(() => assertCashCovers({ EUR: 99.999 }, 'EUR', 100)).not.toThrow();
  });

  it('refuses when there is less cash, saying how much there is', () => {
    expect.assertions(4);
    try {
      assertCashCovers({ EUR: 50 }, 'EUR', 100.5);
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientCashError);
      expect((error as InsufficientCashError).code).toBe('INSUFFICIENT_CASH');
      expect((error as InsufficientCashError).availableMinor).toBe(5000);
      expect((error as InsufficientCashError).currency).toBe('EUR');
    }
  });

  it('refuses when the only cash is in another currency', () => {
    expect(() => assertCashCovers({ USD: 5000 }, 'EUR', 1)).toThrow(InsufficientCashError);
  });
});
