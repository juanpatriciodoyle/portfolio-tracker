import { describe, it, expect } from 'vitest';
import { returnForPeriod, periodPhrase, periodReturnTitle } from '../returnForPeriod';
import type { ChartDataPoint } from '../../data/sampleChartData';

const point = (date: string, value: number, cashflow = 0): ChartDataPoint => ({
  date_time: `${date}T00:00:00.000Z`,
  portfolio_value_in_reporting_currency: value,
  cumulative_cost_in_reporting_currency: 0,
  cashflow_in_reporting_currency: cashflow,
  benchmark_value_in_reporting_currency: 0,
  cumulative_time_weighted_return_rate: 0,
  cumulative_benchmark_time_weighted_return_rate: 0,
});

const HISTORY = [point('2024-01-01', 1000, 1000), point('2024-12-01', 1200), point('2025-01-01', 1300)];

describe('returnForPeriod', () => {
  it('measures since the first deposit for "All"', () => {
    expect(returnForPeriod(HISTORY, 'All').gain).toBe(300);
  });

  it('changes with the selected period', () => {
    const last = returnForPeriod(HISTORY, '1M');
    expect(last.gain).toBe(100);
    expect(last.gain).not.toBe(returnForPeriod(HISTORY, 'All').gain);
  });

  it('is zero without history', () => {
    expect(returnForPeriod([], 'YTD')).toEqual({ gain: 0, percent: 0 });
  });
});

describe('periodPhrase', () => {
  it('names every period in plain words', () => {
    expect(periodPhrase('All')).toBe('since you started');
    expect(periodPhrase('Last month')).toBe('last month');
    expect(periodPhrase('Custom')).toBe('in this period');
  });
});

describe('periodReturnTitle', () => {
  it('calls the whole history "Total return" and any window by its name', () => {
    expect(periodReturnTitle('All')).toBe('Total return');
    expect(periodReturnTitle('YTD')).toBe('YTD return');
    expect(periodReturnTitle('1M')).toBe('1M return');
    expect(periodReturnTitle('Last month')).toBe('Last month return');
    expect(periodReturnTitle('Custom')).toBe('Period return');
  });
});
