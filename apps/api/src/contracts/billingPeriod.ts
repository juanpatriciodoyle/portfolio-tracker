import { addDays, addMonths, daysInclusive } from './calendarDate';
import { COST_CADENCES, type BillingCadence, type CalendarDate, type CostCadence } from './vocabulary';

/** How many whole months one payment of each recurring cadence covers. */
export const MONTHS_PER_CADENCE: Readonly<Record<CostCadence, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  ANNUAL: 12,
};

/**
 * The longest period a bill of each cadence may cover. Billing cycles drift by a few days around the nominal
 * month, so each limit leaves a small grace. A one-off charge has no limit of its own.
 */
const MAX_PERIOD_DAYS: Readonly<Record<CostCadence, number>> = {
  MONTHLY: 35,
  BIMONTHLY: 66,
  QUARTERLY: 100,
  ANNUAL: 370,
};

export function maxPeriodDays(cadence: BillingCadence): number | null {
  return cadence === 'ONE_OFF' ? null : MAX_PERIOD_DAYS[cadence];
}

/** Whether the days a bill covers fit inside what its cadence allows. A shorter period always fits. */
export function periodFitsCadence(cadence: BillingCadence, periodStart: CalendarDate, periodEnd: CalendarDate): boolean {
  if (periodEnd < periodStart) return false;
  const limit = maxPeriodDays(cadence);
  return limit === null || daysInclusive(periodStart, periodEnd) <= limit;
}

/** The shortest recurring cadence the period fits in; null when it is longer than a year or runs backwards. */
export function inferCadenceFromPeriod(periodStart: CalendarDate, periodEnd: CalendarDate): BillingCadence | null {
  return COST_CADENCES.find((cadence) => periodFitsCadence(cadence, periodStart, periodEnd)) ?? null;
}

/** The period one bill of this cadence covers when it ends on `periodEnd`: both days included. */
export function periodEndingOn(cadence: BillingCadence, periodEnd: CalendarDate): { periodStart: CalendarDate; periodEnd: CalendarDate } {
  if (cadence === 'ONE_OFF') return { periodStart: periodEnd, periodEnd };
  return { periodStart: addDays(addMonths(periodEnd, -MONTHS_PER_CADENCE[cadence]), 1), periodEnd };
}
