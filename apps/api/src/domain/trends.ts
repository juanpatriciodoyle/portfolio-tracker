import {
  FIXED_COST_CATEGORIES,
  ROLLING_WINDOW_MONTHS,
  type CalendarDate,
  type FixedCostCategory,
  type RollingWindowMonths,
} from '../contracts/vocabulary';
import { allocateToMonths, type BillingRecord } from './billing';
import { monthOf, monthsEndingAt, previousMonth, type CalendarMonth } from './calendarDate';
import { isActiveOn, monthlyFixedCostBurn } from './fixedCosts';
import type { LivingPhase } from './livingPhase';
import { roundHalfAwayFromZero } from './money';

export type MonthlyTotals = Readonly<Record<CalendarMonth, number>>;

export interface WindowAverage {
  readonly windowMonths: RollingWindowMonths;
  readonly totalMinor: number;
  /** How many months of the window have any bill at all. */
  readonly coveredMonths: number;
  /** The total over the covered months, per covered month; null when no month is covered. */
  readonly averageMinor: number | null;
}

export interface CurrencyWindows {
  readonly currency: string;
  readonly windows: readonly WindowAverage[];
}

export interface PhaseObserved {
  readonly phaseId: string;
  readonly currency: string;
  readonly coveredMonths: number;
  readonly observedMonthlyMinor: number;
  readonly declaredMonthlyMinor: number;
  /** Observed minus declared. */
  readonly driftMinor: number;
  readonly byCategoryMinor: Readonly<Record<FixedCostCategory, number>>;
}

export interface Trends {
  readonly lastCompleteMonth: CalendarMonth;
  readonly fixedCosts: readonly CurrencyWindows[];
  readonly subscriptions: readonly CurrencyWindows[];
  readonly phases: readonly PhaseObserved[];
}

/** The newest month that is entirely over: averages never include the month still in progress. */
export const lastCompleteMonth = (asOf: CalendarDate): CalendarMonth => previousMonth(monthOf(asOf));

/** What the recurring bills add up to in each month they touch. One-off charges are not part of a trend. */
export function monthlyTotals(records: readonly BillingRecord[]): MonthlyTotals {
  const totals: Record<CalendarMonth, number> = {};
  for (const record of records) {
    if (record.cadence === 'ONE_OFF') continue;
    for (const [month, amount] of Object.entries(allocateToMonths(record))) totals[month] = (totals[month] ?? 0) + amount;
  }
  return totals;
}

export function rollingAverage(totals: MonthlyTotals, endMonth: CalendarMonth, windowMonths: RollingWindowMonths): WindowAverage {
  const covered = monthsEndingAt(endMonth, windowMonths).filter((month) => Object.hasOwn(totals, month));
  const totalMinor = covered.reduce((sum, month) => sum + totals[month], 0);
  return {
    windowMonths,
    totalMinor,
    coveredMonths: covered.length,
    averageMinor: covered.length > 0 ? roundHalfAwayFromZero(totalMinor / covered.length) : null,
  };
}

const byStartThenId = (a: LivingPhase, b: LivingPhase) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id);

/**
 * Rolling averages of what the bills really cost (fixed costs and subscriptions apart, one currency
 * at a time) and, per living phase, what the bills say a month costs next to what was declared.
 */
export function buildTrends(input: {
  records: readonly BillingRecord[];
  phases: readonly LivingPhase[];
  asOf: CalendarDate;
}): Trends {
  const endMonth = lastCompleteMonth(input.asOf);
  const currencyOf = new Map(input.phases.map((phase) => [phase.id, phase.currency]));
  const recurring = input.records.filter((record) => record.cadence !== 'ONE_OFF' && currencyOf.has(record.phaseId));

  const windowsFor = (records: readonly BillingRecord[]) =>
    ROLLING_WINDOW_MONTHS.map((windowMonths) => rollingAverage(monthlyTotals(records), endMonth, windowMonths));
  const perCurrency = (isSubscription: boolean): CurrencyWindows[] =>
    [...new Set(recurring.map((record) => currencyOf.get(record.phaseId) as string))].sort().map((currency) => ({
      currency,
      windows: windowsFor(
        recurring.filter(
          (record) => currencyOf.get(record.phaseId) === currency && (record.category === 'SUBSCRIPTIONS') === isSubscription
        )
      ),
    }));

  const phases = [...input.phases].sort(byStartThenId).flatMap((phase): PhaseObserved[] => {
    const own = recurring.filter((record) => record.phaseId === phase.id);
    const monthTotals = monthlyTotals(own);
    const months = Object.keys(monthTotals).filter((month) => month <= endMonth);
    if (months.length === 0) return [];

    const byCategory = Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, 0])) as Record<FixedCostCategory, number>;
    for (const record of own) {
      for (const [month, amount] of Object.entries(allocateToMonths(record))) {
        if (month <= endMonth) byCategory[record.category] += amount;
      }
    }

    const total = months.reduce((sum, month) => sum + monthTotals[month], 0);
    const observedMonthlyMinor = roundHalfAwayFromZero(total / months.length);
    const declaredMonthlyMinor = monthlyFixedCostBurn(phase.fixedCosts.filter((cost) => isActiveOn(cost, input.asOf)));
    return [
      {
        phaseId: phase.id,
        currency: phase.currency,
        coveredMonths: months.length,
        observedMonthlyMinor,
        declaredMonthlyMinor,
        driftMinor: observedMonthlyMinor - declaredMonthlyMinor,
        byCategoryMinor: Object.fromEntries(
          FIXED_COST_CATEGORIES.map((category) => [category, roundHalfAwayFromZero(byCategory[category] / months.length)])
        ) as Record<FixedCostCategory, number>,
      },
    ];
  });

  return { lastCompleteMonth: endMonth, fixedCosts: perCurrency(false), subscriptions: perCurrency(true), phases };
}
