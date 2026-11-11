import { describe, it, expect } from 'vitest';
import { periodReturn } from '../periodReturn';
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

const to = new Date('2025-01-01T00:00:00.000Z');

describe('periodReturn', () => {
  it('is zero without data', () => {
    expect(periodReturn([], null, to)).toEqual({ gain: 0, percent: 0 });
  });

  it('from the beginning, counts every deposit as money in, not as gain', () => {
    const points = [point('2024-01-01', 1000, 1000), point('2024-07-01', 1100), point('2025-01-01', 1200)];
    const result = periodReturn(points, null, to);
    expect(result.gain).toBe(200);
    expect(result.percent).toBeCloseTo(20, 6);
  });

  it('for a window, starts from the value just before it and ignores what came before', () => {
    const points = [point('2024-01-01', 1000, 1000), point('2024-06-01', 1500), point('2025-01-01', 1650)];
    const result = periodReturn(points, new Date('2024-06-01T00:00:00.000Z'), to);
    expect(result.gain).toBe(150);
    expect(result.percent).toBeCloseTo(10, 6);
  });

  it('removes a deposit made inside the window from the gain', () => {
    const points = [point('2024-06-01', 1000), point('2024-09-01', 2000, 1000), point('2025-01-01', 2100)];
    const result = periodReturn(points, new Date('2024-06-01T00:00:00.000Z'), to);
    expect(result.gain).toBe(100);
    expect(result.percent).toBeGreaterThan(0);
    expect(result.percent).toBeLessThan(10);
  });

  it('shows a loss as negative', () => {
    const points = [point('2024-01-01', 1000, 1000), point('2025-01-01', 900)];
    const result = periodReturn(points, null, to);
    expect(result.gain).toBe(-100);
    expect(result.percent).toBeCloseTo(-10, 6);
  });

  it('is zero when the window starts after the last point and nothing moved', () => {
    const points = [point('2024-01-01', 1000, 1000)];
    expect(periodReturn(points, new Date('2024-06-01T00:00:00.000Z'), to)).toEqual({ gain: 0, percent: 0 });
  });

  it('never divides by zero when nothing was ever invested', () => {
    expect(periodReturn([point('2024-01-01', 0)], null, to)).toEqual({ gain: 0, percent: 0 });
  });
});
