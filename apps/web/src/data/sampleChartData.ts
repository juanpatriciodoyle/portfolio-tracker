import type { HistoryPoint } from '../contracts';
import { displayLocale } from '../lib/money';

/** One real reading of the portfolio (see `GET /api/portfolio/history`): the chart and the period figures are made of these only. */
export type ChartDataPoint = HistoryPoint;

/** The windows the person can look at. All of them are measured from real readings; see `lib/periodAvailability.ts`. */
export type ReportingPeriod = 'All' | 'YTD' | '1Y' | '3M' | '1M' | 'Custom';

export interface DateRange {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}

/** The day a window reaching back from `reference` starts on. `null` for the ones that are not a fixed stretch (All, Custom). */
export function periodStartDate(period: ReportingPeriod, reference: Date): Date | null {
  switch (period) {
    case '1M': {
      const start = new Date(reference);
      start.setMonth(reference.getMonth() - 1);
      return start;
    }
    case '3M': {
      const start = new Date(reference);
      start.setMonth(reference.getMonth() - 3);
      return start;
    }
    case '1Y': {
      const start = new Date(reference);
      start.setFullYear(reference.getFullYear() - 1);
      return start;
    }
    case 'YTD':
      return new Date(reference.getFullYear(), 0, 1);
    case 'All':
    case 'Custom':
      return null;
  }
}

/**
 * Filter real time-series data points based on selected reporting period
 */
export function filterDataByPeriod(
  data: ChartDataPoint[],
  period: ReportingPeriod,
  customRange?: DateRange
): {
  filteredData: ChartDataPoint[];
  startDate: Date;
  endDate: Date;
} {
  if (!data.length) {
    const now = new Date();
    return { filteredData: [], startDate: now, endDate: now };
  }

  const maxDate = new Date(data[data.length - 1].date_time);
  let minDate = periodStartDate(period, maxDate) ?? new Date(data[0].date_time);

  if (period === 'Custom' && customRange?.fromDate && customRange?.toDate) {
    minDate = new Date(customRange.fromDate);
    const to = new Date(customRange.toDate);
    to.setHours(23, 59, 59, 999);
    const filtered = data.filter((d) => {
      const ptDate = new Date(d.date_time);
      return ptDate >= minDate && ptDate <= to;
    });
    return { filteredData: filtered, startDate: minDate, endDate: to };
  }

  const filteredData = data.filter((d) => new Date(d.date_time) >= minDate);
  return {
    filteredData: filteredData.length > 0 ? filteredData : data,
    startDate: minDate,
    endDate: maxDate,
  };
}

const CURRENCY_SIGNS: Readonly<Record<string, string>> = { EUR: '€', USD: '$', GBP: '£' };

/**
 * Format currency with locale standard
 */
export function formatCurrency(value: number, currency = 'EUR', decimals = 2, locale: string = displayLocale()): string {
  // A currency without a sign of its own is written with its code: another currency's sign would be a wrong amount.
  const symbol = CURRENCY_SIGNS[currency] ?? `${currency} `;
  const isNegative = value < 0;
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Format percentage string
 */
export function formatPercent(value: number, includeSign = true, locale: string = displayLocale()): string {
  const sign = includeSign && value > 0 ? '+' : '';
  const digits = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(value);
  return `${sign}${digits}%`;
}
