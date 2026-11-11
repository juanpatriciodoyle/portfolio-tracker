import { describe, it, expect } from 'vitest';
import { checkSaleQuantity, formatUnits, findSellable, type SellablePosition } from '../saleRules';

const position = (symbol: string, name: string, quantity: number): SellablePosition => ({
  symbol,
  name,
  quantity,
  assetClass: 'Equity',
  sector: 'Technology',
  region: 'North America',
});

describe('checkSaleQuantity', () => {
  it('accepts anything above zero up to what is held', () => {
    expect(checkSaleQuantity('3', 10)).toEqual({ ok: true, quantity: 3 });
    expect(checkSaleQuantity('10', 10)).toEqual({ ok: true, quantity: 10 });
    expect(checkSaleQuantity('0.025', 10)).toEqual({ ok: true, quantity: 0.025 });
  });

  it('rejects more than is held, saying how much there is', () => {
    expect(checkSaleQuantity('10.5', 10)).toEqual({ ok: false, message: 'You only hold 10 units.' });
  });

  it('rejects zero, negative and empty quantities', () => {
    for (const text of ['0', '-1', '', 'abc']) expect(checkSaleQuantity(text, 10).ok).toBe(false);
  });

  it('says "unit" for exactly one', () => {
    expect(checkSaleQuantity('2', 1)).toEqual({ ok: false, message: 'You only hold 1 unit.' });
  });

  it('allows the whole holding despite floating-point dust', () => {
    expect(checkSaleQuantity('0.30000000000000004', 0.3).ok).toBe(true);
  });
});

describe('formatUnits', () => {
  it('drops trailing zeros and caps the decimals', () => {
    expect(formatUnits(10)).toBe('10');
    expect(formatUnits(0.5)).toBe('0.5');
    expect(formatUnits(0.123456789)).toBe('0.12345679');
  });
});

describe('findSellable', () => {
  const held = [position('AAPL', 'Apple Inc.', 10), position('VUAA.DE', 'Vanguard S&P 500', 3)];

  it('lists everything for an empty search', () => {
    expect(findSellable(held, '')).toHaveLength(2);
  });

  it('matches the ticker or the name, ignoring case', () => {
    expect(findSellable(held, 'aap').map((p) => p.symbol)).toEqual(['AAPL']);
    expect(findSellable(held, 'vanguard').map((p) => p.symbol)).toEqual(['VUAA.DE']);
  });

  it('finds nothing for a stranger', () => {
    expect(findSellable(held, 'tesla')).toEqual([]);
  });

  it('never offers an empty position', () => {
    expect(findSellable([position('X', 'X', 0)], '')).toEqual([]);
  });
});
