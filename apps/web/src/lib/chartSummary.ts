import type { ChartDataPoint } from '../data/sampleChartData';
import type { Translate } from '../i18n/translate';

export type ChartSummaryMode = 'value' | 'profit';

interface ChartSummaryInput {
  /** The readings the chart draws, oldest first. */
  points: readonly ChartDataPoint[];
  mode: ChartSummaryMode;
  formatMoney: (amount: number) => string;
  formatDay: (isoDateTime: string) => string;
  t: Translate;
}

const valueOf = (point: ChartDataPoint, mode: ChartSummaryMode) =>
  mode === 'value' ? point.portfolio_value_in_reporting_currency : point.portfolio_value_in_reporting_currency - point.cumulative_cost_in_reporting_currency;

/**
 * The chart in one sentence, for whoever cannot see the canvas: where the line starts and where it ends.
 * Null when there is no line to describe (fewer than two real readings).
 */
export function chartSummary({ points, mode, formatMoney, formatDay, t }: ChartSummaryInput): string | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const params = {
    start: formatMoney(valueOf(first, mode)),
    from: formatDay(first.date_time),
    end: formatMoney(valueOf(last, mode)),
    to: formatDay(last.date_time),
  };
  return mode === 'value' ? t('chart.summary.value', params) : t('chart.summary.profit', params);
}
