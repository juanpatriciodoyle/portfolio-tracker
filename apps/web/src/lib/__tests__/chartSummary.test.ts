import { describe, it, expect } from 'vitest';
import { chartSummary } from '../chartSummary';
import type { ChartDataPoint } from '../../data/sampleChartData';
import { translateEnglish } from '../../i18n/translate';

const point = (date: string, value: number, cost: number): ChartDataPoint => ({
  date_time: `${date}T12:00:00.000Z`,
  portfolio_value_in_reporting_currency: value,
  cumulative_cost_in_reporting_currency: cost,
  cashflow_in_reporting_currency: 0,
  benchmark_value_in_reporting_currency: null,
});

const words = {
  t: translateEnglish,
  formatMoney: (amount: number) => `€${amount}`,
  formatDay: (iso: string) => iso.slice(0, 10),
};

describe('chartSummary', () => {
  it('says where the value line starts and ends, with the days', () => {
    const points = [point('2026-03-12', 1000, 900), point('2026-06-01', 1200, 900), point('2026-11-24', 1500, 1000)];
    expect(chartSummary({ points, mode: 'value', ...words })).toBe('Your portfolio value, from €1000 on 2026-03-12 to €1500 on 2026-11-24.');
  });

  it('says the same for the profit line, which is value minus the money put in', () => {
    const points = [point('2026-03-12', 1000, 900), point('2026-11-24', 1500, 1000)];
    expect(chartSummary({ points, mode: 'profit', ...words })).toBe('Your profit, from €100 on 2026-03-12 to €500 on 2026-11-24.');
  });

  it('keeps a loss as a negative amount', () => {
    const points = [point('2026-03-12', 1000, 1200), point('2026-11-24', 900, 1200)];
    expect(chartSummary({ points, mode: 'profit', ...words })).toBe('Your profit, from €-200 on 2026-03-12 to €-300 on 2026-11-24.');
  });

  it('has nothing to say with fewer than two readings: there is no line', () => {
    expect(chartSummary({ points: [], mode: 'value', ...words })).toBeNull();
    expect(chartSummary({ points: [point('2026-11-24', 1500, 1000)], mode: 'value', ...words })).toBeNull();
  });
});
