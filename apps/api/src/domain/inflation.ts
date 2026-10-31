/**
 * Pure inflation maths: no I/O, no clock, no dependence on the host time zone.
 * Every input (rates, dates, fallback) is an argument and calendar fields are read in UTC.
 * Rates are annual CPI percentages: 2.8 means 2.8%.
 */

/** Annual inflation (percent) by calendar year. Years without published data are absent. */
export type AnnualInflationRates = Readonly<Partial<Record<number, number>>>;

/** Port: where annual rates come from (World Bank + DB cache in production, an in-memory fake in tests). */
export interface InflationRateProvider {
  getAnnualRates(country: string): Promise<AnnualInflationRates>;
}

/** Annual rate (percent) assumed for countries missing from DEFAULT_ANNUAL_INFLATION_PERCENT. */
export const FALLBACK_ANNUAL_INFLATION_PERCENT = 2.8;

/** Annual rates (percent) assumed for years with no published data, e.g. when live data is unreachable. */
export const DEFAULT_ANNUAL_INFLATION_PERCENT: Readonly<Partial<Record<string, number>>> = {
  Spain: 2.8,
  Germany: 2.6,
  'United Kingdom': 2.3,
  'United States': 3.1,
  Argentina: 210.0,
  Brazil: 4.2,
  Japan: 2.8,
  France: 2.5,
  Italy: 2.7,
};

const MS_PER_AVERAGE_MONTH = 1000 * 60 * 60 * 24 * 30.44;

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

export function defaultAnnualInflationPercent(country: string): number {
  return DEFAULT_ANNUAL_INFLATION_PERCENT[country] ?? FALLBACK_ANNUAL_INFLATION_PERCENT;
}

export interface HoldingPeriodInflationInput {
  annualRates: AnnualInflationRates;
  /** Percent applied to any year absent from annualRates. */
  fallbackAnnualRate: number;
  start: Date;
  end: Date;
}

/**
 * Cumulative inflation (percent, rounded to one decimal) over a holding period.
 * Partial years accrue pro rata and are not compounded: the first year counts the months from
 * the start month to December inclusive, the last year the months from January to the end
 * month inclusive, and a period inside a single year counts elapsed 30.44-day months with a
 * one-month minimum. Whole years in between compound.
 */
export function holdingPeriodInflationPercent({
  annualRates,
  fallbackAnnualRate,
  start,
  end,
}: HoldingPeriodInflationInput): number {
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const annualRate = (year: number) => (annualRates[year] ?? fallbackAnnualRate) / 100;

  let compoundFactor = 1.0;

  if (startYear === endYear) {
    const months = Math.max(1, (end.getTime() - start.getTime()) / MS_PER_AVERAGE_MONTH);
    compoundFactor *= 1 + annualRate(startYear) * (months / 12);
  } else {
    for (let year = startYear; year <= endYear; year++) {
      if (year === startYear) {
        const monthsLeftInYear = 12 - start.getUTCMonth();
        compoundFactor *= 1 + annualRate(year) * (monthsLeftInYear / 12);
      } else if (year === endYear) {
        const monthsPassedInYear = end.getUTCMonth() + 1;
        compoundFactor *= 1 + annualRate(year) * (monthsPassedInYear / 12);
      } else {
        compoundFactor *= 1 + annualRate(year);
      }
    }
  }

  return roundToOneDecimal((compoundFactor - 1) * 100);
}

/** Part of `investedAmount` (in its own currency) eroded by `cumulativeInflationPercent`. */
export function inflationLossAmount(investedAmount: number, cumulativeInflationPercent: number): number {
  return investedAmount * (cumulativeInflationPercent / 100);
}
