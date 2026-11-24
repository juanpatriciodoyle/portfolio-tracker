import { describe, it, expect } from 'vitest';
import type { PortfolioHistoryResponse } from '../../contracts';
import { translatorFor } from '../../i18n/translate';
import { heroInsights, type HeroInsightsInput } from '../heroInsights';

const position = (symbol: string, invested: number, value: number, holdingDays: number) => ({
  id: symbol,
  symbol,
  name: symbol,
  assetClass: 'Stock',
  region: 'US',
  sector: 'Technology',
  quantity: 1,
  investedAmount: invested,
  currentValue: value,
  holdingDays,
});

const emptyHistory: PortfolioHistoryResponse = { realFrom: null, points: [] };

const input = (overrides: Partial<HeroInsightsInput> = {}): HeroInsightsInput => ({
  positions: [position('Apple', 1000, 2500, 500), position('Vanguard', 1000, 1800, 400), position('Nvidia', 3000, 1000, 100)],
  soldAssets: [],
  totalProfit: 300,
  moneyPutIn: 5000,
  pricesAvailable: true,
  nominalPercent: 38.4,
  realPercent: 9.6,
  history: emptyHistory,
  period: 'All',
  isRealInflationMode: false,
  currency: 'EUR',
  locale: 'en-US',
  t: translatorFor('en'),
  today: new Date('2026-11-24T10:00:00Z'),
  ...overrides,
});

describe('heroInsights', () => {
  it('tells what drove the profit, in plain words', () => {
    expect(heroInsights(input()).story).toBe('Apple and Vanguard made €2,300. Nvidia is down €2,000.');
  });

  it('writes the names the way the language joins them', () => {
    const story = heroInsights(input({ locale: 'es-AR', t: translatorFor('es-AR') })).story;
    expect(story).toContain('Apple y Vanguard ganaron');
  });

  it('has no story for a window of time, which is a different profit from the whole history', () => {
    expect(heroInsights(input({ period: '1Y' })).story).toBeNull();
  });

  it('has no story while the inflation switch is on: the holdings are not adjusted, the hero is', () => {
    expect(heroInsights(input({ isRealInflationMode: true })).story).toBeNull();
  });

  it('has no story without live prices', () => {
    expect(heroInsights(input({ pricesAvailable: false })).story).toBeNull();
  });

  it('adds the world index only when the readings reach back a year', () => {
    const point = (value: number, benchmark: number) => ({
      date_time: '2026-11-24T00:00:00Z',
      portfolio_value_in_reporting_currency: value,
      cumulative_cost_in_reporting_currency: 5000,
      cashflow_in_reporting_currency: 0,
      benchmark_value_in_reporting_currency: benchmark,
    });
    const withYear = heroInsights(input({ history: { realFrom: '2025-11-01', points: [point(5300, 5000)] } })).story;
    expect(withYear).toContain('would be worth €300 less today, before fees and tax.');
    const withMonth = heroInsights(input({ history: { realFrom: '2026-10-01', points: [point(5300, 5000)] } })).story;
    expect(withMonth).not.toContain('index');
  });

  it('shows the inflation line once the oldest holding is a year old', () => {
    expect(heroInsights(input()).inflation).toEqual({ before: 38.4, after: 9.6 });
  });

  it('keeps the inflation line off for a portfolio under a year old and for a window of time', () => {
    expect(heroInsights(input({ positions: [position('A', 1, 2, 100), position('B', 1, 2, 50)] })).inflation).toBeNull();
    expect(heroInsights(input({ period: '1Y' })).inflation).toBeNull();
  });
});
