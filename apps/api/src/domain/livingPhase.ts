import type { CalendarDate, FixedCostCategory, PhaseStatus } from '../contracts/vocabulary';
import { AVERAGE_DAYS_PER_MONTH, compareCalendarDates, daysInclusive } from './calendarDate';
import { InvalidLivingPhaseError } from './errors';
import {
  baselineSavingsCapacity,
  monthlyBurnByCategory,
  monthlyFixedCostBurn,
  type FixedCost,
} from './fixedCosts';
import { roundHalfAwayFromZero } from './money';
import type { PhaseSnapshot } from './phaseComparison';

export interface FixedCostItem extends FixedCost {
  readonly id: string;
}

/** A stretch of life in one home: where, when, what came in and what the fixed costs were. */
export interface LivingPhase {
  readonly id: string;
  readonly startDate: CalendarDate;
  /** null means "still living here". */
  readonly endDate: CalendarDate | null;
  readonly currency: string;
  readonly monthlyIncomeMinor: number;
  readonly fixedCosts: readonly FixedCostItem[];
}

const isMinorAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;

export function createFixedCost(input: FixedCostItem): FixedCostItem {
  if (!isMinorAmount(input.amountMinor)) {
    throw new InvalidLivingPhaseError('A fixed cost must be a whole, non-negative amount of minor units');
  }
  return { ...input };
}

export function createLivingPhase(input: LivingPhase): LivingPhase {
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new InvalidLivingPhaseError('A living phase needs a three-letter ISO currency code');
  }
  if (!isMinorAmount(input.monthlyIncomeMinor)) {
    throw new InvalidLivingPhaseError('Monthly income must be a whole, non-negative amount of minor units');
  }
  if (input.endDate !== null && input.endDate < input.startDate) {
    throw new InvalidLivingPhaseError('A living phase cannot end before it starts');
  }
  return { ...input, fixedCosts: input.fixedCosts.map(createFixedCost) };
}

export interface DateRange {
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
}

/** Later than any real date, so an open-ended phase never "ends". Calendar dates compare as strings. */
const NEVER = '9999-12-31';

/** Phases are closed ranges: a phase ending on a day and another starting that same day do overlap. */
const rangesOverlap = (a: DateRange, b: DateRange) =>
  a.startDate <= (b.endDate ?? NEVER) && b.startDate <= (a.endDate ?? NEVER);

const byStartThenId = (a: DateRange & { id: string }, b: DateRange & { id: string }) =>
  compareCalendarDates(a.startDate, b.startDate) || compareCalendarDates(a.id, b.id);

/** Every pair of overlapping phases, the earlier-starting phase first, in a stable order. */
export function findOverlaps(
  phases: readonly (DateRange & { id: string })[]
): readonly (readonly [string, string])[] {
  const ordered = [...phases].sort(byStartThenId);
  const pairs: (readonly [string, string])[] = [];
  for (let first = 0; first < ordered.length; first++) {
    for (let second = first + 1; second < ordered.length; second++) {
      if (rangesOverlap(ordered[first], ordered[second])) pairs.push([ordered[first].id, ordered[second].id]);
    }
  }
  return pairs;
}

/** The ids of existing phases a candidate would overlap, ignoring the candidate itself when editing. */
export function findConflicts(
  candidate: DateRange & { id?: string },
  existing: readonly (DateRange & { id: string })[]
): readonly string[] {
  return existing
    .filter((other) => other.id !== candidate.id && rangesOverlap(candidate, other))
    .map((other) => other.id);
}

export function phaseStatus(phase: DateRange, asOf: CalendarDate): PhaseStatus {
  if (asOf < phase.startDate) return 'upcoming';
  if (phase.endDate !== null && asOf > phase.endDate) return 'past';
  return 'current';
}

/** Average months lived in a phase up to the as-of day, counting both ends; 0 before it starts. */
export function phaseMonths(phase: DateRange, asOf: CalendarDate): number {
  if (asOf < phase.startDate) return 0;
  const lastDay = phase.endDate !== null && phase.endDate < asOf ? phase.endDate : asOf;
  return daysInclusive(phase.startDate, lastDay) / AVERAGE_DAYS_PER_MONTH;
}

export interface TimelineEntry {
  readonly phaseId: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
  readonly status: PhaseStatus;
  readonly currency: string;
  readonly monthlyIncomeMinor: number;
  readonly monthlyFixedCostsMinor: number;
  readonly savingsCapacityMinor: number;
  readonly savingsRate: number | null;
  readonly fixedCostsByCategoryMinor: Readonly<Record<FixedCostCategory, number>>;
  readonly months: number;
  readonly totalIncomeMinor: number;
  readonly totalFixedCostsMinor: number;
}

/** A phase's monthly picture, independent of any date: what comparisons and the timeline are built from. */
export function phaseSnapshot(phase: LivingPhase): PhaseSnapshot & { readonly savingsRate: number | null } {
  const monthlyFixedCostsMinor = monthlyFixedCostBurn(phase.fixedCosts);
  const { capacityMinor, savingsRate } = baselineSavingsCapacity({
    monthlyIncomeMinor: phase.monthlyIncomeMinor,
    monthlyFixedCostsMinor,
  });

  return {
    currency: phase.currency,
    monthlyIncomeMinor: phase.monthlyIncomeMinor,
    monthlyFixedCostsMinor,
    savingsCapacityMinor: capacityMinor,
    savingsRate,
    fixedCostsByCategoryMinor: monthlyBurnByCategory(phase.fixedCosts),
  };
}

/** The chapters of a life, oldest first, each with its monthly burn, savings capacity and totals so far. */
export function buildTimeline(phases: readonly LivingPhase[], asOf: CalendarDate): TimelineEntry[] {
  return [...phases].sort(byStartThenId).map((phase) => {
    const snapshot = phaseSnapshot(phase);
    const months = phaseMonths(phase, asOf);

    return {
      ...snapshot,
      phaseId: phase.id,
      startDate: phase.startDate,
      endDate: phase.endDate,
      status: phaseStatus(phase, asOf),
      months,
      totalIncomeMinor: roundHalfAwayFromZero(snapshot.monthlyIncomeMinor * months),
      totalFixedCostsMinor: roundHalfAwayFromZero(snapshot.monthlyFixedCostsMinor * months),
    };
  });
}
