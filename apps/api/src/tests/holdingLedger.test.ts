import { availableUnits, assertSaleCovered, type LedgerEntry } from '../domain/holdingLedger';
import { InsufficientHoldingsError } from '../domain/errors';

const entry = (type: LedgerEntry['type'], symbol: string, quantity: number, date: string): LedgerEntry => ({
  type,
  symbol,
  quantity,
  date: new Date(date),
});

const HISTORY: LedgerEntry[] = [
  entry('BOUGHT', 'AAPL', 10, '2024-01-10'),
  entry('BOUGHT', 'AAPL', 5, '2024-03-10'),
  entry('SOLD', 'AAPL', 4, '2024-06-10'),
  entry('BOUGHT', 'MSFT', 2, '2024-02-01'),
  entry('DEPOSIT', 'CASH', 1000, '2024-01-01'),
];

describe('availableUnits', () => {
  it('is zero for an instrument never bought', () => {
    expect(availableUnits(HISTORY, 'TSLA', new Date('2025-01-01'))).toBe(0);
  });

  it('is zero for an empty ledger', () => {
    expect(availableUnits([], 'AAPL', new Date('2025-01-01'))).toBe(0);
  });

  it('adds buys and subtracts sales up to the date given', () => {
    expect(availableUnits(HISTORY, 'AAPL', new Date('2024-02-01'))).toBe(10);
    expect(availableUnits(HISTORY, 'AAPL', new Date('2024-04-01'))).toBe(15);
    expect(availableUnits(HISTORY, 'AAPL', new Date('2025-01-01'))).toBe(11);
  });

  it('ignores cash movements and other instruments', () => {
    expect(availableUnits(HISTORY, 'CASH', new Date('2025-01-01'))).toBe(0);
    expect(availableUnits(HISTORY, 'MSFT', new Date('2025-01-01'))).toBe(2);
  });

  it('matches symbols without regard to case', () => {
    expect(availableUnits(HISTORY, 'aapl', new Date('2025-01-01'))).toBe(11);
  });

  it('does not leave floating-point dust behind', () => {
    const dust = [entry('BOUGHT', 'BTC-USD', 0.3, '2024-01-01'), entry('SOLD', 'BTC-USD', 0.1, '2024-02-01'), entry('SOLD', 'BTC-USD', 0.2, '2024-03-01')];
    expect(availableUnits(dust, 'BTC-USD', new Date('2025-01-01'))).toBe(0);
  });
});

describe('assertSaleCovered', () => {
  it('accepts selling everything held', () => {
    expect(() => assertSaleCovered(HISTORY, 'AAPL', 11, new Date('2025-01-01'))).not.toThrow();
  });

  it('rejects an instrument that is not held', () => {
    expect(() => assertSaleCovered(HISTORY, 'TSLA', 1, new Date('2025-01-01'))).toThrow(InsufficientHoldingsError);
  });

  it('rejects more than is held, saying how much is available', () => {
    expect(() => assertSaleCovered(HISTORY, 'AAPL', 11.5, new Date('2025-01-01'))).toThrow(/11/);
  });

  it('rejects a sale dated before the purchase', () => {
    expect(() => assertSaleCovered(HISTORY, 'AAPL', 1, new Date('2023-12-01'))).toThrow(InsufficientHoldingsError);
  });

  it('rejects a back-dated sale that would leave a later sale uncovered', () => {
    // 15 units on 2024-04-01, 4 sold on 2024-06-10: selling 12 on 2024-04-02 would leave 3, and the June sale needs 4.
    expect(() => assertSaleCovered(HISTORY, 'AAPL', 12, new Date('2024-04-02'))).toThrow(InsufficientHoldingsError);
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => assertSaleCovered(HISTORY, 'AAPL', 0, new Date('2025-01-01'))).toThrow(InsufficientHoldingsError);
    expect(() => assertSaleCovered(HISTORY, 'AAPL', -1, new Date('2025-01-01'))).toThrow(InsufficientHoldingsError);
  });
});
