import { describe, it, expect } from 'vitest';
import { buildHoldingRows, sortHoldingRows, type PositionItem, type SoldAssetItem } from '../holdingsRows';

const apple: PositionItem = {
  id: 'p1',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetClass: 'Equity',
  region: 'North America',
  sector: 'Technology',
  quantity: 10,
  investedAmount: 1800,
  costPerShare: 180,
  currentPrice: 220,
  currentValue: 2200,
  holdingDays: 120,
};
const bitcoin: PositionItem = {
  id: 'p2',
  symbol: 'BTC',
  name: 'Bitcoin',
  assetClass: 'Cryptocurrency',
  region: 'Global',
  sector: 'Crypto',
  quantity: 0.5,
  investedAmount: 30000,
  costPerShare: 60000,
  currentPrice: 65000,
  currentValue: 32500,
  holdingDays: 800,
};
const tesla: SoldAssetItem = {
  id: 's1',
  symbol: 'TSLA',
  assetClass: 'Stock',
  region: 'North America',
  sector: 'Consumer',
  investedAmount: 1000,
  returnedAmount: 1250,
  soldProfit: 250,
  soldProfitPercent: 25,
  holdingInflationPercent: 2.5,
  realProfitEuros: 225,
  holdingDays: 1,
  date: '2024-05-01T00:00:00.000Z',
};
const netWorth = 34700;
const build = (over: Partial<Parameters<typeof buildHoldingRows>[0]> = {}) =>
  buildHoldingRows({ positions: [apple, bitcoin], soldAssets: [tesla], netWorth, showClosed: false, isRealInflationMode: false, ...over });

describe('buildHoldingRows', () => {
  it('turns an open position into the figures the table shows', () => {
    const row = build()[0];
    expect(row).toMatchObject({
      id: 'pos-p1',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      isOpen: true,
      units: 10,
      heldDays: 120,
      paid: 1800,
      paidPerShare: 180,
      value: 2200,
      pricePerShare: 220,
      profit: 400,
    });
    expect(row.profitPercent).toBeCloseTo(22.22, 2);
    expect(row.share).toBeCloseTo((2200 / 34700) * 100, 6);
  });

  it('reads older class words as the class on the one list, and Crypto is never a sector', () => {
    const [, btc] = build();
    expect(build()[0].assetClass).toBe('Stock');
    expect(btc.assetClass).toBe('Crypto');
    expect(btc.sector).toBe('');
  });

  it('has no yearly return before a year is held, and compounds it after', () => {
    const [aaple, btc] = build();
    expect(aaple.yearlyReturn).toBeNull();
    // +8.33% over 800 days: a year's worth is smaller than the total.
    expect(btc.profitPercent).toBeCloseTo(8.33, 2);
    expect(btc.yearlyReturn).toBeGreaterThan(0);
    expect(btc.yearlyReturn).toBeLessThan(btc.profitPercent);
  });

  it('holds back sold holdings until they are asked for', () => {
    expect(build().map((row) => row.symbol)).toEqual(['AAPL', 'BTC']);
    expect(build({ showClosed: true }).map((row) => row.symbol)).toEqual(['AAPL', 'BTC', 'TSLA']);
  });

  it('shows a sold holding once, as sold, with what it brought back and no unit or share figures', () => {
    const sold = build({ showClosed: true })[2];
    expect(sold).toMatchObject({ id: 'sold-s1', name: 'TSLA', symbol: 'TSLA', isOpen: false, units: 0, heldDays: 1, paid: 1000, value: 1250, profit: 250, profitPercent: 25, share: 0, yearlyReturn: null });
  });

  it('uses the inflation-adjusted profit of a sold holding when asked', () => {
    const sold = build({ showClosed: true, isRealInflationMode: true })[2];
    expect(sold.profit).toBe(225);
    expect(sold.profitPercent).toBeCloseTo(22.5, 6);
  });

  it('counts a missing holding period as one day, and cost as the value when there is no price', () => {
    const [row] = build({ positions: [{ ...apple, holdingDays: undefined, currentValue: undefined, currentPrice: undefined }] });
    expect(row.heldDays).toBe(1);
    expect(row.value).toBe(1800);
    expect(row.profit).toBe(0);
    expect(row.pricePerShare).toBe(180);
  });

  it('has no share of a portfolio worth nothing, and no percent of nothing paid', () => {
    const [row] = build({ netWorth: 0, positions: [{ ...apple, investedAmount: 0, quantity: 0, costPerShare: undefined }] });
    expect(row.share).toBe(0);
    expect(row.profitPercent).toBe(0);
    expect(row.paidPerShare).toBe(0);
  });
});

describe('sortHoldingRows', () => {
  const rows = () => build({ showClosed: true });

  it('sorts by name, ascending or descending', () => {
    expect(sortHoldingRows(rows(), 'name', 'asc').map((r) => r.name)).toEqual(['Apple Inc.', 'Bitcoin', 'TSLA']);
    expect(sortHoldingRows(rows(), 'name', 'desc').map((r) => r.name)).toEqual(['TSLA', 'Bitcoin', 'Apple Inc.']);
  });

  it('sorts by a number', () => {
    expect(sortHoldingRows(rows(), 'value', 'desc').map((r) => r.symbol)).toEqual(['BTC', 'AAPL', 'TSLA']);
    expect(sortHoldingRows(rows(), 'profit', 'asc').map((r) => r.symbol)).toEqual(['TSLA', 'AAPL', 'BTC']);
    expect(sortHoldingRows(rows(), 'held', 'desc').map((r) => r.symbol)).toEqual(['BTC', 'AAPL', 'TSLA']);
  });

  it('keeps holdings with no yearly return last, whichever way it sorts', () => {
    expect(sortHoldingRows(rows(), 'yearlyReturn', 'desc').map((r) => r.symbol)[0]).toBe('BTC');
    expect(sortHoldingRows(rows(), 'yearlyReturn', 'asc').map((r) => r.symbol)[0]).toBe('BTC');
  });

  it('does not change the list it was given', () => {
    const original = rows();
    sortHoldingRows(original, 'value', 'asc');
    expect(original.map((r) => r.symbol)).toEqual(['AAPL', 'BTC', 'TSLA']);
  });
});
