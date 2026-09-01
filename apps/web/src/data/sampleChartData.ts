export interface ChartDataPoint {
  date_time: string; // ISO or formatted date string
  portfolio_value_in_reporting_currency: number;
  cumulative_cost_in_reporting_currency: number;
  cashflow_in_reporting_currency: number;
  benchmark_value_in_reporting_currency: number;
  cumulative_time_weighted_return_rate: number;
  cumulative_benchmark_time_weighted_return_rate: number;
}

export type ReportingPeriod =
  | 'All'
  | 'YTD'
  | '1Y'
  | 'MTD'
  | '1M'
  | '1W'
  | '1D'
  | 'Last year'
  | 'Last month'
  | 'Custom';

export interface DateRange {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
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

  const latestPoint = data[data.length - 1];
  const maxDate = new Date(latestPoint.date_time);
  let minDate = new Date(data[0].date_time);

  switch (period) {
    case '1D': {
      minDate = new Date(maxDate);
      minDate.setDate(maxDate.getDate() - 1);
      break;
    }
    case '1W': {
      minDate = new Date(maxDate);
      minDate.setDate(maxDate.getDate() - 7);
      break;
    }
    case '1M': {
      minDate = new Date(maxDate);
      minDate.setMonth(maxDate.getMonth() - 1);
      break;
    }
    case 'MTD': {
      minDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      break;
    }
    case '1Y': {
      minDate = new Date(maxDate);
      minDate.setFullYear(maxDate.getFullYear() - 1);
      break;
    }
    case 'YTD': {
      minDate = new Date(maxDate.getFullYear(), 0, 1);
      break;
    }
    case 'Last month': {
      const lastMonthDate = new Date(maxDate.getFullYear(), maxDate.getMonth() - 1, 1);
      minDate = lastMonthDate;
      const endOfLastMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 0, 23, 59, 59);
      const filtered = data.filter((d) => {
        const ptDate = new Date(d.date_time);
        return ptDate >= minDate && ptDate <= endOfLastMonth;
      });
      return { filteredData: filtered, startDate: minDate, endDate: endOfLastMonth };
    }
    case 'Last year': {
      const prevYear = maxDate.getFullYear() - 1;
      const startLastYear = new Date(prevYear, 0, 1);
      const endLastYear = new Date(prevYear, 11, 31, 23, 59, 59);
      const filtered = data.filter((d) => {
        const ptDate = new Date(d.date_time);
        return ptDate >= startLastYear && ptDate <= endLastYear;
      });
      return { filteredData: filtered, startDate: startLastYear, endDate: endLastYear };
    }
    case 'Custom': {
      if (customRange?.fromDate && customRange?.toDate) {
        minDate = new Date(customRange.fromDate);
        const to = new Date(customRange.toDate);
        to.setHours(23, 59, 59, 999);
        const filtered = data.filter((d) => {
          const ptDate = new Date(d.date_time);
          return ptDate >= minDate && ptDate <= to;
        });
        return { filteredData: filtered, startDate: minDate, endDate: to };
      }
      break;
    }
    case 'All':
    default:
      minDate = new Date(data[0].date_time);
      break;
  }

  const filteredData = data.filter((d) => new Date(d.date_time) >= minDate);
  return {
    filteredData: filteredData.length > 0 ? filteredData : data,
    startDate: minDate,
    endDate: maxDate,
  };
}

/**
 * Format currency with locale standard
 */
export function formatCurrency(value: number, currency = 'EUR', decimals = 2): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '£';
  const isNegative = value < 0;
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Format percentage string
 */
export function formatPercent(value: number, includeSign = true): string {
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
