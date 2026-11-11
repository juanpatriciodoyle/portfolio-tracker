import { filterDataByPeriod, type ChartDataPoint, type DateRange, type ReportingPeriod } from '../data/sampleChartData';
import { periodReturn, type PeriodReturn } from './periodReturn';

/** What the portfolio gained or lost over the selected reporting period. One answer for the chart and the tiles. */
export function returnForPeriod(data: ChartDataPoint[], period: ReportingPeriod, customRange?: DateRange): PeriodReturn {
  if (data.length === 0) return { gain: 0, percent: 0 };
  const { startDate, endDate } = filterDataByPeriod(data, period, customRange);
  return periodReturn(data, period === 'All' ? null : startDate, endDate);
}

const PHRASES: Record<ReportingPeriod, string> = {
  All: 'since you started',
  YTD: 'this year',
  '1Y': 'in the past year',
  MTD: 'this month',
  '1M': 'in the past month',
  '1W': 'in the past week',
  '1D': 'in the past day',
  'Last year': 'last year',
  'Last month': 'last month',
  Custom: 'in this period',
};

export const periodPhrase = (period: ReportingPeriod): string => PHRASES[period];

/** The title of the return card: "Total return" for everything, "<period> return" for a window. */
export const periodReturnTitle = (period: ReportingPeriod): string =>
  period === 'All' ? 'Total return' : period === 'Custom' ? 'Period return' : `${period} return`;
