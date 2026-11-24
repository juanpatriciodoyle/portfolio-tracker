import { describe, expect, it } from 'vitest';
import type { ChartDataPoint } from '../../data/sampleChartData';
import { axisLabels } from '../chartAxis';

const point = (date: string): ChartDataPoint => ({
  date_time: `${date}T12:00:00.000Z`,
  portfolio_value_in_reporting_currency: 1,
  cumulative_cost_in_reporting_currency: 1,
  cashflow_in_reporting_currency: 0,
  benchmark_value_in_reporting_currency: null,
});

const series = (...dates: string[]) => dates.map(point);

describe('axisLabels', () => {
  it('has no labels for fewer than two points', () => {
    expect(axisLabels([], 'en-US')).toEqual([]);
    expect(axisLabels(series('2026-03-10'), 'en-US')).toEqual([]);
  });

  it('has none when every point falls on one day', () => {
    expect(axisLabels(series('2026-03-10', '2026-03-10', '2026-03-10'), 'en-US')).toEqual([]);
  });

  it('names the day over a short stretch', () => {
    expect(axisLabels(series('2026-03-01', '2026-03-10', '2026-03-20'), 'en-US').map((l) => l.label)).toEqual(['Mar 1', 'Mar 10', 'Mar 20']);
  });

  it('names the month and the full year over a long stretch, so it cannot be read as a day', () => {
    const labels = axisLabels(series('2024-03-01', '2024-09-15', '2025-03-01'), 'en-US').map((l) => l.label);
    expect(labels).toEqual(['Mar 2024', 'Sep 2024', 'Mar 2025']);
  });

  it('never repeats a label: several points in one month give one label', () => {
    const labels = axisLabels(series('2024-01-02', '2024-01-10', '2024-01-20', '2024-01-28', '2024-07-01', '2024-07-05'), 'en-US').map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(['Jan 2024', 'Jul 2024']);
  });

  it('spreads at most six labels over the series, first and last included', () => {
    const dates = Array.from({ length: 40 }, (_, i) => `2024-${String(Math.floor(i / 4) + 1).padStart(2, '0')}-${String((i % 4) * 7 + 1).padStart(2, '0')}`);
    const labels = axisLabels(series(...dates), 'en-US');
    expect(labels.length).toBeLessThanOrEqual(6);
    expect(labels[0].index).toBe(0);
    expect(labels[labels.length - 1].index).toBe(dates.length - 1);
  });

  it('writes in the language of the screen', () => {
    expect(axisLabels(series('2024-03-01', '2025-03-01'), 'es-AR').map((l) => l.label.toLowerCase())).toEqual(['mar 2024', 'mar 2025']);
  });
});
