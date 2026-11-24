import { filterDataByPeriod, type ChartDataPoint, type DateRange, type ReportingPeriod } from '../data/sampleChartData';
import type { MessageKey } from '../i18n/catalogs';
import { translateEnglish, type Translate } from '../i18n/translate';
import { periodReturn, type PeriodReturn } from './periodReturn';

/** What the portfolio gained or lost over the selected reporting period. One answer for the chart and the tiles. */
export function returnForPeriod(data: ChartDataPoint[], period: ReportingPeriod, customRange?: DateRange): PeriodReturn {
  if (data.length === 0) return { gain: 0, percent: 0 };
  const { startDate, endDate } = filterDataByPeriod(data, period, customRange);
  return periodReturn(data, period === 'All' ? null : startDate, endDate);
}

const PHRASES: Record<ReportingPeriod, MessageKey> = {
  All: 'period.phrase.all',
  YTD: 'period.phrase.ytd',
  '1Y': 'period.phrase.1y',
  '3M': 'period.phrase.3m',
  '1M': 'period.phrase.1m',
  Custom: 'period.phrase.custom',
};

export const periodPhrase = (period: ReportingPeriod, t: Translate = translateEnglish): string => t(PHRASES[period]);
