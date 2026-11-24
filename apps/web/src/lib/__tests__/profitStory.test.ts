import { describe, it, expect } from 'vitest';
import type { PortfolioHistoryResponse } from '../../contracts';
import { translatorFor } from '../../i18n/translate';
import {
  DETRACTOR_MIN_LOSS,
  DETRACTOR_SHARE_OF_PROFIT,
  DOMINANT_SHARE_OF_PROFIT,
  INDEX_MIN_MONTHS,
  MAX_CONTRIBUTORS,
  MIN_HOLDINGS_FOR_STORY,
  describeProfitStory,
  profitStory,
  storyHoldings,
  worldIndexComparison,
  type StoryHolding,
} from '../profitStory';

const holding = (symbol: string, profit: number, stillHeld = true): StoryHolding => ({ symbol, name: symbol, profit, stillHeld });

const base = {
  holdings: [holding('Apple', 60000), holding('S&P 500 fund', 34000), holding('Nvidia', -44000), holding('Bonds', 2000)],
  totalProfit: 108000,
  pricesAvailable: true,
  indexComparison: null,
};

describe('profitStory: what is named', () => {
  it('has named limits', () => {
    expect(MIN_HOLDINGS_FOR_STORY).toBe(2);
    expect(MAX_CONTRIBUTORS).toBe(2);
    expect(DOMINANT_SHARE_OF_PROFIT).toBe(0.7);
    expect(DETRACTOR_SHARE_OF_PROFIT).toBe(0.05);
    expect(DETRACTOR_MIN_LOSS).toBe(1000);
    expect(INDEX_MIN_MONTHS).toBe(12);
  });

  it('names the two holdings that earned most and the one that lost most', () => {
    const story = profitStory(base);
    expect(story?.contributors.map((h) => h.symbol)).toEqual(['Apple', 'S&P 500 fund']);
    expect(story?.detractor?.symbol).toBe('Nvidia');
    expect(story?.mostlyOne).toBeNull();
  });

  it('says nothing without live prices: the holdings would all be shown at what they cost', () => {
    expect(profitStory({ ...base, pricesAvailable: false })).toBeNull();
  });

  it('says nothing with fewer than two holdings: there is nothing to compare', () => {
    expect(profitStory({ ...base, holdings: [holding('Apple', 5000)] })).toBeNull();
    expect(profitStory({ ...base, holdings: [] })).toBeNull();
  });

  it('says nothing when nobody earned or lost enough to name', () => {
    expect(profitStory({ ...base, holdings: [holding('A', 0), holding('B', 0)], totalProfit: 0 })).toBeNull();
  });

  it('names one contributor when only one earned and the portfolio as a whole is down', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 500), holding('B', -3000)], totalProfit: -2500 });
    expect(story?.contributors.map((h) => h.symbol)).toEqual(['A']);
    expect(story?.mostlyOne).toBeNull();
  });

  it('judges "mostly one" against what the holdings earned, not against the net profit that the losses lower', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 1000), holding('B', 900), holding('C', -1500)], totalProfit: 400 });
    expect(story?.mostlyOne).toBeNull();
    expect(story?.contributors.map((h) => h.symbol)).toEqual(['A', 'B']);
  });

  it('says "mostly one holding" when the only one that earned is all of the profit', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 3000), holding('B', -100)], totalProfit: 2900 });
    expect(story?.mostlyOne?.symbol).toBe('A');
  });

  it('says "mostly one holding" instead of two names when one holding is over 70% of the profit', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 80000), holding('B', 20000)], totalProfit: 100000 });
    expect(story?.mostlyOne?.symbol).toBe('A');
    expect(story?.contributors).toEqual([]);
  });

  it('keeps naming both when the top holding is exactly 70% of the profit', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 70000), holding('B', 30000)], totalProfit: 100000 });
    expect(story?.mostlyOne).toBeNull();
    expect(story?.contributors).toHaveLength(2);
  });
});

describe('profitStory: the detractor is only named when the loss matters', () => {
  it('is named when the loss is over 5% of the profit', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 100000), holding('B', 20000), holding('C', -6000)], totalProfit: 114000 });
    expect(story?.detractor?.symbol).toBe('C');
  });

  it('is not named when the loss is small against the profit and under 1,000', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 100000), holding('B', 50000), holding('C', -900)], totalProfit: 149100 });
    expect(story?.detractor).toBeNull();
  });

  it('is named when the loss is over 1,000 even if it is small against the profit', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 900000), holding('B', 50000), holding('C', -1200)], totalProfit: 948800 });
    expect(story?.detractor?.symbol).toBe('C');
  });

  it('is judged against the size of a loss when the whole portfolio is down', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 500), holding('B', -3000), holding('C', -500)], totalProfit: -3000 });
    expect(story?.detractor?.symbol).toBe('B');
    expect(story?.contributors.map((h) => h.symbol)).toEqual(['A']);
  });

  it('is the one that lost most when several lost', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 100000), holding('B', 20000), holding('C', -6000), holding('D', -9000)], totalProfit: 105000 });
    expect(story?.detractor?.symbol).toBe('D');
  });
});

describe('profitStory: the world index', () => {
  it('compares with the index when a comparison is given', () => {
    const story = profitStory({ ...base, indexComparison: { portfolioValue: 120000, indexValue: 97000 } });
    expect(story?.index).toEqual({ difference: 23000, same: false });
  });

  it('is empty without a comparison', () => {
    expect(profitStory(base)?.index).toBeNull();
  });

  it('can be the only thing worth saying', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 0), holding('B', 0)], totalProfit: 0, indexComparison: { portfolioValue: 100, indexValue: 90 } });
    expect(story?.index).toEqual({ difference: 10, same: false });
  });
});

describe('worldIndexComparison: only with a year of real readings', () => {
  const point = (date: string, value: number, benchmark: number | null) => ({
    date_time: date,
    portfolio_value_in_reporting_currency: value,
    cumulative_cost_in_reporting_currency: 100,
    cashflow_in_reporting_currency: 0,
    benchmark_value_in_reporting_currency: benchmark,
  });
  const today = new Date('2026-11-24T10:00:00Z');
  const history = (realFrom: string | null, last = point('2026-11-24T00:00:00Z', 120, 100)): PortfolioHistoryResponse => ({ realFrom, points: [point('2025-01-01T00:00:00Z', 100, 100), last] });

  it('compares the last reading when readings reach back twelve months', () => {
    expect(worldIndexComparison(history('2025-11-24'), today)).toEqual({ portfolioValue: 120, indexValue: 100 });
  });

  it('says nothing one day short of twelve months', () => {
    expect(worldIndexComparison(history('2025-11-25'), today)).toBeNull();
  });

  it('says nothing without readings', () => {
    expect(worldIndexComparison({ realFrom: null, points: [] }, today)).toBeNull();
  });

  it('says nothing when the index price was unknown on the last reading', () => {
    expect(worldIndexComparison(history('2024-01-01', point('2026-11-24T00:00:00Z', 120, null)), today)).toBeNull();
  });
});

describe('storyHoldings: one line per holding, open and sold together', () => {
  const position = (symbol: string, invested: number, value: number | undefined, name = symbol) => ({
    id: symbol,
    symbol,
    name,
    assetClass: 'Stock',
    region: 'US',
    sector: 'Technology',
    quantity: 1,
    investedAmount: invested,
    currentValue: value,
  });
  const sold = (symbol: string, soldProfit: number) => ({
    id: `sold-${symbol}`,
    symbol,
    assetClass: 'Stock',
    region: 'US',
    sector: 'Technology',
    investedAmount: 100,
    returnedAmount: 100 + soldProfit,
    soldProfit,
    soldProfitPercent: 0,
    holdingInflationPercent: 0,
    realProfitEuros: 0,
    date: '2026-01-01',
  });

  it('is what a position is worth minus what it cost', () => {
    expect(storyHoldings([position('AAPL', 1000, 1800, 'Apple')], [])).toEqual([{ symbol: 'AAPL', name: 'Apple', profit: 800, stillHeld: true }]);
  });

  it('adds the profit locked in by selling to what is still held in the same asset', () => {
    expect(storyHoldings([position('AAPL', 1000, 1800)], [sold('AAPL', 200)])[0]).toMatchObject({ profit: 1000, stillHeld: true });
  });

  it('keeps a fully sold asset as its own line, no longer held', () => {
    expect(storyHoldings([], [sold('TSLA', -400), sold('TSLA', 100)])).toEqual([{ symbol: 'TSLA', name: 'TSLA', profit: -300, stillHeld: false }]);
  });

  it('counts a position with no price as no gain', () => {
    expect(storyHoldings([position('AAPL', 1000, undefined)], [])[0].profit).toBe(0);
  });
});

describe('describeProfitStory: the words', () => {
  const t = translatorFor('en');
  const money = (amount: number) => `€${Math.abs(Math.round(amount))}`;
  const list = (names: string[]) => names.join(' and ');
  const words = { t, money, list };

  it('names the contributors with what they made, and the one that lost', () => {
    const story = profitStory(base)!;
    expect(describeProfitStory(story, words)).toBe('Apple and S&P 500 fund made €94000. Nvidia is down €44000.');
  });

  it('uses the singular for one contributor', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 500), holding('B', -3000)], totalProfit: -2500 })!;
    expect(describeProfitStory(story, words)).toBe('A made €500. B is down €3000.');
  });

  it('says a sold asset lost, not that it is down', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 100000), holding('B', 20000), holding('C', -6000, false)], totalProfit: 114000 })!;
    expect(describeProfitStory(story, words)).toContain('C lost €6000.');
  });

  it('says "most of your profit comes from one holding" instead of two names', () => {
    const story = profitStory({ ...base, holdings: [holding('A', 80000), holding('B', 20000)], totalProfit: 100000 })!;
    expect(describeProfitStory(story, words)).toBe('Most of your profit comes from one holding: A.');
  });

  it('says the index would be worth less or more, never red or blue, with fees and tax named', () => {
    const less = profitStory({ ...base, indexComparison: { portfolioValue: 120, indexValue: 97 } })!;
    expect(describeProfitStory(less, words)).toContain('The same money in a world index fund would be worth €23 less today, before fees and tax.');
    const more = profitStory({ ...base, indexComparison: { portfolioValue: 90, indexValue: 120 } })!;
    expect(describeProfitStory(more, words)).toContain('would be worth €30 more today, before fees and tax.');
  });

  it('says "about the same" when the gap is under 1% of the value', () => {
    const story = profitStory({ ...base, indexComparison: { portfolioValue: 1000, indexValue: 995 } })!;
    expect(describeProfitStory(story, words)).toContain('would be worth about the same today, before fees and tax.');
  });

  it('never calls anything a mistake', () => {
    const story = profitStory({ ...base, indexComparison: { portfolioValue: 90, indexValue: 120 } })!;
    expect(describeProfitStory(story, words).toLowerCase()).not.toContain('mistake');
  });

  it('is written in Argentine Spanish with the verb in agreement', () => {
    const es = { ...words, t: translatorFor('es-AR'), list: (names: string[]) => names.join(' y ') };
    const story = profitStory(base)!;
    expect(describeProfitStory(story, es)).toBe('Apple y S&P 500 fund ganaron €94000. Nvidia acumula una pérdida de €44000.');
  });
});
