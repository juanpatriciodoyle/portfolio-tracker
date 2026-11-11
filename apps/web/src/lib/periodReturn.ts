import type { ChartDataPoint } from '../data/sampleChartData';

export interface PeriodReturn {
  /** What the portfolio gained or lost in the window, deposits and withdrawals taken out. */
  gain: number;
  percent: number;
}

const MS_PER_DAY = 86_400_000;
const time = (point: ChartDataPoint) => new Date(point.date_time).getTime();

/**
 * Return over a window of the value history: end value - start value - net money moved in, as a percentage of the
 * money at work (the start value plus each deposit weighted by the time it was invested: the Modified Dietz method).
 * `from === null` means since the first deposit. Pure: the window's end date is an argument.
 */
export function periodReturn(points: readonly ChartDataPoint[], from: Date | null, to: Date): PeriodReturn {
  const inWindowEnd = points.filter((p) => time(p) <= to.getTime());
  if (inWindowEnd.length === 0) return { gain: 0, percent: 0 };

  const baseline = from === null ? undefined : [...inWindowEnd].reverse().find((p) => time(p) <= from.getTime());
  const startTime = baseline ? time(baseline) : time(inWindowEnd[0]);
  const startValue = baseline ? baseline.portfolio_value_in_reporting_currency : 0;
  const moves = inWindowEnd.filter((p) => (baseline ? time(p) > time(baseline) : true) && p.cashflow_in_reporting_currency !== 0);

  const endTime = time(inWindowEnd[inWindowEnd.length - 1]);
  const endValue = inWindowEnd[inWindowEnd.length - 1].portfolio_value_in_reporting_currency;
  const span = Math.max(endTime - startTime, MS_PER_DAY);

  const netMoved = moves.reduce((sum, p) => sum + p.cashflow_in_reporting_currency, 0);
  const gain = endValue - startValue - netMoved;

  const atWork = moves.reduce((sum, p) => sum + p.cashflow_in_reporting_currency * Math.min(1, Math.max(0, (endTime - time(p)) / span)), startValue);
  return { gain, percent: atWork > 0 ? (gain / atWork) * 100 : 0 };
}
