import type { FixedCostCategory } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { currencyExponent, displayLocale, formatMinor, formatPercent, monthNames } from '../../lib/money';
import { CATEGORY_LABELS } from './labels';

/** The part of a bill the trend reads. */
export interface BillLike {
  category: FixedCostCategory;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
}

/**
 * Heating and cooling follow the weather: winter against summer says nothing about the person's costs, so it is left out
 * rather than compared a year apart (nobody has a year of bills in the first months).
 */
const SEASONAL: readonly FixedCostCategory[] = ['HEATING_COOLING'];

/** A change smaller than this share of what it is compared with is noise. */
export const MIN_COST_CHANGE_SHARE = 0.1;
/** A change smaller than this many units of the currency (5 euros, 5 yen) is noise too. */
export const MIN_COST_CHANGE_UNITS = 5;
/** Fewer bills than this in the six months are not a trend. */
export const MIN_BILLS_FOR_TREND = 3;
/** A change in the share of income kept smaller than this many points is noise. */
export const MIN_SAVINGS_CHANGE = 0.05;
/** One category is named only when it is at least this share of the change. */
const MOST_OF_IT = 0.5;

export interface CostTrend {
  direction: 'rose' | 'fell';
  /** How much the average month changed, positive, in minor units. */
  changeMinor: number;
  /** The first month of the recent window, as 'YYYY-MM'. */
  sinceMonth: string;
  /** The category that makes up most of the change, when one does. */
  biggestCategory: FixedCostCategory | null;
}

export interface SavingsTrend {
  direction: 'up' | 'down';
  /** Fractions of income, 0.69 for 69%. */
  from: number;
  to: number;
}

export type PhaseTrend = CostTrend | (SavingsTrend & { previousName: string });

const DAY_MS = 86_400_000;

const monthKey = (year: number, monthIndex: number) => {
  const wrapped = new Date(Date.UTC(year, monthIndex, 1));
  return `${wrapped.getUTCFullYear()}-${String(wrapped.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** The calendar days of a period (both ends included) that fall in each month. */
export function daysByMonth(periodStart: string, periodEnd: string): Map<string, number> {
  const days = new Map<string, number>();
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  for (let time = Date.parse(`${periodStart}T00:00:00Z`); time <= end; time += DAY_MS) {
    const month = new Date(time).toISOString().slice(0, 7);
    days.set(month, (days.get(month) ?? 0) + 1);
  }
  return days;
}

interface Window {
  /** What each category cost in the months of the window that have any bill, per such month. */
  perMonthMinor: Map<FixedCostCategory, number>;
  totalPerMonthMinor: number;
  coveredMonths: number;
  bills: Set<BillLike>;
}

/** What the bills cost each month of a window, each spread evenly over the days it covers. */
function windowOf(records: readonly BillLike[], months: readonly string[]): Window {
  const spent = new Map<FixedCostCategory, number>();
  const covered = new Set<string>();
  const bills = new Set<BillLike>();
  for (const record of records) {
    if (SEASONAL.includes(record.category)) continue;
    const byMonth = daysByMonth(record.periodStart, record.periodEnd);
    const totalDays = [...byMonth.values()].reduce((sum, days) => sum + days, 0);
    for (const month of months) {
      const days = byMonth.get(month);
      if (!days || totalDays === 0) continue;
      spent.set(record.category, (spent.get(record.category) ?? 0) + (record.amountMinor * days) / totalDays);
      covered.add(month);
      bills.add(record);
    }
  }
  const coveredMonths = covered.size;
  const perMonthMinor = new Map([...spent].map(([category, amount]) => [category, coveredMonths === 0 ? 0 : amount / coveredMonths]));
  return { perMonthMinor, totalPerMonthMinor: [...perMonthMinor.values()].reduce((sum, amount) => sum + amount, 0), coveredMonths, bills };
}

/**
 * Whether the bills of the last three complete months average clearly more or less than the three before. Only with enough
 * bills and a change that matters (10% and 5 units of the currency); seasonal costs are left out.
 */
export function costTrend(records: readonly BillLike[], asOf: string, currency: string): CostTrend | null {
  const [year, month] = asOf.split('-').map(Number);
  // The last complete month is the one before the month of `asOf`.
  const monthAt = (back: number) => monthKey(year, month - 2 - back);
  const recentMonths = [monthAt(2), monthAt(1), monthAt(0)];
  const earlierMonths = [monthAt(5), monthAt(4), monthAt(3)];

  const recent = windowOf(records, recentMonths);
  const earlier = windowOf(records, earlierMonths);
  if (recent.coveredMonths === 0 || earlier.coveredMonths === 0) return null;
  if (new Set([...recent.bills, ...earlier.bills]).size < MIN_BILLS_FOR_TREND) return null;
  if (!(earlier.totalPerMonthMinor > 0)) return null;

  const change = recent.totalPerMonthMinor - earlier.totalPerMonthMinor;
  const size = Math.abs(change);
  if (size < MIN_COST_CHANGE_UNITS * 10 ** currencyExponent(currency) || size / earlier.totalPerMonthMinor < MIN_COST_CHANGE_SHARE) return null;

  const categories = new Set([...recent.perMonthMinor.keys(), ...earlier.perMonthMinor.keys()]);
  let biggest: { category: FixedCostCategory; size: number } | null = null;
  for (const category of categories) {
    const categoryChange = (recent.perMonthMinor.get(category) ?? 0) - (earlier.perMonthMinor.get(category) ?? 0);
    if (Math.sign(categoryChange) === Math.sign(change) && Math.abs(categoryChange) > (biggest?.size ?? 0)) biggest = { category, size: Math.abs(categoryChange) };
  }

  return {
    direction: change > 0 ? 'rose' : 'fell',
    changeMinor: Math.round(size),
    sinceMonth: recentMonths[0],
    biggestCategory: biggest && biggest.size / size >= MOST_OF_IT ? biggest.category : null,
  };
}

/** Whether the share of income left after fixed costs moved clearly against the previous home. */
export function savingsTrend(current: number | null, previous: number | null): SavingsTrend | null {
  if (current === null || previous === null) return null;
  if (Math.abs(current - previous) < MIN_SAVINGS_CHANGE) return null;
  return { direction: current > previous ? 'up' : 'down', from: previous, to: current };
}

/** One sentence for a trend. The numbers were worked out above; this only decides how they read. */
export function describeTrend(trend: PhaseTrend, currency: string, locale: string = displayLocale(), t: Translate = currentTranslator()): string {
  if ('changeMinor' in trend) {
    const month = monthNames('long', locale)[Number(trend.sinceMonth.slice(5)) - 1];
    const params = { amount: formatMinor(trend.changeMinor, currency, locale), month };
    const named = trend.biggestCategory ? { ...params, category: t(CATEGORY_LABELS[trend.biggestCategory]) } : null;
    if (trend.direction === 'rose') return named ? t('trend.costsRoseMost', named) : t('trend.costsRose', params);
    return named ? t('trend.costsFellMost', named) : t('trend.costsFell', params);
  }
  return t(trend.direction === 'up' ? 'trend.savingsUp' : 'trend.savingsDown', {
    to: formatPercent(trend.to, locale),
    from: formatPercent(trend.from, locale),
    name: trend.previousName,
  });
}
