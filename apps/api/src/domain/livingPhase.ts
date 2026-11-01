import type { CalendarDate, FixedCostCategory, PhaseStatus } from '../contracts/vocabulary';
import { AVERAGE_DAYS_PER_MONTH, compareCalendarDates, daysInclusive } from './calendarDate';
import { InvalidLivingPhaseError } from './errors';
import { effectiveMonthlyCosts, type BilledCost, type CategoryCost } from './effectiveCosts';
import { baselineSavingsCapacity, type FixedCost } from './fixedCosts';
import { averageMonthlyIncomeMinor, earnedIncomeMinor, monthlyIncomeOn, type IncomeStream } from './income';
import { roundHalfAwayFromZero } from './money';
import type { PhaseSnapshot } from './phaseComparison';

export interface FixedCostItem extends FixedCost {
  readonly id: string;
  /** The name the person gave this cost, such as "Digi fibre". */
  readonly label?: string | null;
}

/** A stretch of life in one home: where, when, what came in and what the fixed costs were. */
export interface LivingPhase {
  readonly id: string;
  readonly startDate: CalendarDate;
  /** null means "still living here". */
  readonly endDate: CalendarDate | null;
  readonly currency: string;
  /** Every source of income, added up day by day. None at all is a valid phase: a sabbatical, a gap year. */
  readonly incomeStreams: readonly IncomeStream[];
  readonly fixedCosts: readonly FixedCostItem[];
  /** The bills received for this phase: they move the monthly costs away from what was declared. */
  readonly bills?: readonly BilledCost[];
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
  if (input.endDate !== null && input.endDate < input.startDate) {
    throw new InvalidLivingPhaseError('A living phase cannot end before it starts');
  }
  for (const stream of input.incomeStreams) {
    if (stream.label.trim() === '') {
      throw new InvalidLivingPhaseError('An income stream needs a label');
    }
    if (!isMinorAmount(stream.amountMinor)) {
      throw new InvalidLivingPhaseError('An income stream must be a whole, non-negative amount of minor units');
    }
    if (stream.endDate !== null && stream.endDate < stream.startDate) {
      throw new InvalidLivingPhaseError('An income stream cannot end before it starts');
    }
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
  /** The same picture with the average month of the stay in place of the current rate. */
  readonly averageMonthlyIncomeMinor: number;
  readonly averageSavingsCapacityMinor: number;
  readonly averageSavingsRate: number | null;
  readonly fixedCostsByCategoryMinor: Readonly<Record<FixedCostCategory, number>>;
  /** Where each category's monthly cost comes from: what was declared, or the bills received. */
  readonly costBasisByCategory: Readonly<Record<FixedCostCategory, Pick<CategoryCost, 'basis' | 'billCount'>>>;
  readonly months: number;
  readonly totalIncomeMinor: number;
  readonly totalFixedCostsMinor: number;
}

/** The day whose income stands for a phase: the as-of day, held inside the phase's own days. */
function referenceDay(phase: DateRange, asOf: CalendarDate): CalendarDate {
  if (asOf < phase.startDate) return phase.startDate;
  return phase.endDate !== null && asOf > phase.endDate ? phase.endDate : asOf;
}

/**
 * A phase's monthly picture: what comes in on the as-of day (the phase's own first or last day when it is
 * upcoming or past) and what each category costs per month, declared rates and bills together.
 * Comparisons and the timeline are built from it.
 */
export function phaseSnapshot(
  phase: LivingPhase,
  asOf: CalendarDate
): PhaseSnapshot & { readonly savingsRate: number | null; readonly costBasisByCategory: TimelineEntry['costBasisByCategory'] } {
  const costs = effectiveMonthlyCosts({
    declared: phase.fixedCosts.map(({ category, cadence, amountMinor, label }) => ({ category, cadence, amountMinor, label: label ?? null })),
    bills: phase.bills ?? [],
  });
  const monthlyIncomeMinor = monthlyIncomeOn(phase.incomeStreams, referenceDay(phase, asOf));
  const { capacityMinor, savingsRate } = baselineSavingsCapacity({
    monthlyIncomeMinor,
    monthlyFixedCostsMinor: costs.monthlyFixedCostsMinor,
  });

  const byCategory = Object.entries(costs.byCategory) as [FixedCostCategory, CategoryCost][];
  return {
    currency: phase.currency,
    monthlyIncomeMinor,
    monthlyFixedCostsMinor: costs.monthlyFixedCostsMinor,
    savingsCapacityMinor: capacityMinor,
    savingsRate,
    fixedCostsByCategoryMinor: Object.fromEntries(byCategory.map(([category, cost]) => [category, cost.monthlyMinor])) as Record<FixedCostCategory, number>,
    costBasisByCategory: Object.fromEntries(
      byCategory.map(([category, { basis, billCount }]) => [category, { basis, billCount }])
    ) as TimelineEntry['costBasisByCategory'],
  };
}

/** The chapters of a life, oldest first, each with its monthly burn, savings capacity and totals so far. */
export function buildTimeline(phases: readonly LivingPhase[], asOf: CalendarDate): TimelineEntry[] {
  return [...phases].sort(byStartThenId).map((phase) => {
    const snapshot = phaseSnapshot(phase, asOf);
    const months = phaseMonths(phase, asOf);
    const span = { streams: phase.incomeStreams, startDate: phase.startDate, endDate: phase.endDate };
    const averageMonthlyIncome = averageMonthlyIncomeMinor(span, asOf);
    const averageCapacity = baselineSavingsCapacity({ monthlyIncomeMinor: averageMonthlyIncome, monthlyFixedCostsMinor: snapshot.monthlyFixedCostsMinor });
    const average = {
      averageMonthlyIncomeMinor: averageMonthlyIncome,
      averageSavingsCapacityMinor: averageCapacity.capacityMinor,
      averageSavingsRate: averageCapacity.savingsRate,
    };

    return {
      ...snapshot,
      phaseId: phase.id,
      startDate: phase.startDate,
      endDate: phase.endDate,
      status: phaseStatus(phase, asOf),
      months,
      totalIncomeMinor: earnedIncomeMinor(span, asOf),
      ...average,
      totalFixedCostsMinor: roundHalfAwayFromZero(snapshot.monthlyFixedCostsMinor * months),
    };
  });
}
