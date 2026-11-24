import { describe, it, expect } from 'vitest';
import { heroSummary, type HeroFigures, type HeroSummaryInput } from '../heroSummary';

const figures: HeroFigures = {
  netWorth: 559342.51,
  realNetWorth: 480000,
  cashBalance: 64500,
  moneyPutIn: 340450,
  openMarketValue: 494842.51,
  openProfit: 154392.51,
  realOpenProfit: 100000,
  soldProfit: 44900,
  realSoldProfit: 20000,
  dividends: 0,
  totalFees: 121,
  totalGain: 199171.51,
  totalGainPercent: 70.25,
  pricesAvailable: true,
};

const input: HeroSummaryInput = {
  figures,
  period: 'All',
  periodGain: 0,
  periodPercent: 0,
  isRealInflationMode: false,
};

const sum = (amounts: number[]) => Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;

describe('heroSummary: the total value', () => {
  it('is the net worth, split into the value of the holdings and cash', () => {
    const { totalValue, holdingsValue, cash } = heroSummary(input);
    expect(totalValue).toEqual({ title: 'Total value', amount: 559342.51, beforeInflation: null });
    expect(holdingsValue).toBe(494842.51);
    expect(cash).toBe(64500);
    expect(holdingsValue + cash).toBeCloseTo(totalValue.amount, 8);
  });

  it('carries the money put in, which is not the value of anything', () => {
    expect(heroSummary(input).moneyPutIn).toBe(340450);
  });

  it('with inflation on, is the purchasing-power figure and keeps the nominal one beside it', () => {
    const { totalValue } = heroSummary({ ...input, isRealInflationMode: true });
    expect(totalValue).toEqual({ title: 'Total value, after inflation', amount: 480000, beforeInflation: 559342.51 });
  });
});

describe('heroSummary: the gain', () => {
  it('on the whole history is the total gain', () => {
    const { gain } = heroSummary(input);
    expect(gain).toEqual({ label: 'Total profit', amount: 199171.51, percent: 70.25, phrase: 'since you started' });
  });

  it('has no percentage before any money was put in: there is nothing to measure it against', () => {
    const { gain } = heroSummary({ ...input, figures: { ...figures, moneyPutIn: 0, totalGain: 0, totalGainPercent: 0 } });
    expect(gain.percent).toBeNull();
    expect(gain.label).toBe('Total profit');
  });

  it('for a window is what the window gained, said in plain words', () => {
    const { gain, gainParts } = heroSummary({ ...input, period: 'YTD', periodGain: 117670.76, periodPercent: 41.51 });
    expect(gain).toEqual({ label: 'Profit', amount: 117670.76, percent: 41.51, phrase: 'this year' });
    expect(gainParts).toBeNull();
  });

  it('keeps a window as it is when inflation is on: its history has no inflation figures', () => {
    const { gain } = heroSummary({ ...input, period: '1Y', periodGain: 10, periodPercent: 1, isRealInflationMode: true });
    expect(gain.phrase).toBe('in the past year');
  });

  it('says "after inflation" on the whole history when inflation is on', () => {
    const { gain } = heroSummary({ ...input, isRealInflationMode: true });
    expect(gain.phrase).toBe('since you started, after inflation');
  });

  it('stays negative when the portfolio lost money', () => {
    const { gain } = heroSummary({ ...input, figures: { ...figures, totalGain: -1200, totalGainPercent: -3.5 } });
    expect(gain.amount).toBe(-1200);
    expect(gain.percent).toBe(-3.5);
  });
});

describe('heroSummary: how the gain adds up', () => {
  it('lists still invested, sold and fees, and they add up to the total gain', () => {
    const { gainParts, gain } = heroSummary(input);
    expect(gainParts?.map((part) => part.key)).toEqual(['held', 'sold', 'fees']);
    expect(gainParts?.map((part) => part.amount)).toEqual([154392.51, 44900, -121]);
    expect(sum(gainParts!.map((part) => part.amount))).toBe(gain.amount);
  });

  it('adds dividends when there are some, and still adds up', () => {
    const withDividends = { ...figures, dividends: 100, totalGain: 199271.51 };
    const { gainParts, gain } = heroSummary({ ...input, figures: withDividends });
    expect(gainParts?.map((part) => part.key)).toEqual(['held', 'sold', 'dividends', 'fees']);
    expect(sum(gainParts!.map((part) => part.amount))).toBe(gain.amount);
  });

  it('leaves out a part that is zero', () => {
    const noFees = { ...figures, totalFees: 0, totalGain: 199292.51 };
    expect(heroSummary({ ...input, figures: noFees }).gainParts?.map((part) => part.key)).toEqual(['held', 'sold']);
  });

  it('with inflation on, folds dividends, fees and their inflation into one remainder so it still adds up', () => {
    const real = { ...figures, totalGain: 117670.76, totalGainPercent: 41.51 };
    const { gainParts, gain } = heroSummary({ ...input, figures: real, isRealInflationMode: true });
    expect(gainParts?.map((part) => part.key)).toEqual(['held', 'sold', 'dividendsAndFees']);
    expect(gainParts?.map((part) => part.amount)).toEqual([100000, 20000, -2329.24]);
    expect(sum(gainParts!.map((part) => part.amount))).toBe(gain.amount);
  });

  it('gives every part a plain meaning for someone who has never invested', () => {
    for (const part of heroSummary(input).gainParts!) {
      expect(part.label.length).toBeGreaterThan(0);
      expect(part.meaning.length).toBeGreaterThan(10);
    }
  });
});

describe('heroSummary: edge cases', () => {
  it('carries the missing-prices flag so the hero can say values are at cost', () => {
    expect(heroSummary({ ...input, figures: { ...figures, pricesAvailable: false } }).pricesAvailable).toBe(false);
  });
});
