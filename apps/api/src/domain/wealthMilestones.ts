import type { CapitalMilestone } from '../contracts/capitalMilestone';
import { UTILITY_CATEGORIES, type FixedCostCategory } from '../contracts/vocabulary';
import { roundHalfAwayFromZero } from './money';

/** What invested capital can sustainably pay out each year, after inflation. Deliberately cautious. */
export const CONSERVATIVE_REAL_YIELD = 0.06;

const MONTHS_PER_YEAR = 12;
/** Float noise such as 6.000000000000001 must not push a whole amount up to the next unit. */
const NOISE_GRID = 1e6;

/** The costs the first milestone covers: utilities, internet, phone and subscriptions. */
const UTILITIES_AND_SUBSCRIPTIONS: readonly FixedCostCategory[] = [...UTILITY_CATEGORIES, 'INTERNET', 'PHONE', 'SUBSCRIPTIONS'];

export const MILESTONE_KINDS = ['UTILITIES_AND_SUBSCRIPTIONS', 'RENT', 'LIVING_COST'] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];
export type MilestoneId = 1 | 2 | 3;

export interface Milestone {
  readonly id: MilestoneId;
  readonly kind: MilestoneKind;
  readonly monthlyCostMinor: number;
  /** The capital whose second salary just covers the cost. */
  readonly capitalNeededMinor: number;
  readonly reached: boolean;
  /** How much of the cost the second salary covers, from 0 to 1. */
  readonly progress: number;
}

/** The monthly second salary the person chose to aim at, and how far the portfolio is from it. */
export interface SecondSalaryTarget {
  readonly monthlyMinor: number;
  /** How far the second salary is toward the target, from 0 to 1. */
  readonly progress: number;
  readonly reached: boolean;
  readonly capitalNeededMinor: number;
}

export interface WealthMilestones {
  readonly secondSalaryMinor: number;
  /** In order of id; a milestone whose cost is nothing is left out. */
  readonly milestones: readonly Milestone[];
  /** The highest milestone reached; null when none is (or when no cost is known). */
  readonly reachedMilestone: MilestoneId | null;
  /** Null when the person has not set a target. */
  readonly target: SecondSalaryTarget | null;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/** What the capital pays each month if it earns `annualYield` a year. Capital below zero pays nothing. */
export function secondSalaryMinor(capitalMinor: number, annualYield: number = CONSERVATIVE_REAL_YIELD): number {
  if (capitalMinor <= 0) return 0;
  return roundHalfAwayFromZero((capitalMinor * annualYield) / MONTHS_PER_YEAR);
}

/** The least capital whose second salary reaches `monthlyMinor`. */
export function capitalNeededMinor(monthlyMinor: number, annualYield: number = CONSERVATIVE_REAL_YIELD): number {
  if (monthlyMinor <= 0) return 0;
  const exact = Math.round(((monthlyMinor * MONTHS_PER_YEAR) / annualYield) * NOISE_GRID) / NOISE_GRID;
  let capital = Math.ceil(exact);
  while (secondSalaryMinor(capital, annualYield) < monthlyMinor) capital += 1;
  return capital;
}

function milestoneCosts(byCategory: Readonly<Record<FixedCostCategory, number>>): readonly { id: MilestoneId; kind: MilestoneKind; cost: number }[] {
  const sum = (categories: readonly FixedCostCategory[]) => categories.reduce((total, category) => total + byCategory[category], 0);
  return [
    { id: 1, kind: 'UTILITIES_AND_SUBSCRIPTIONS', cost: sum(UTILITIES_AND_SUBSCRIPTIONS) },
    { id: 2, kind: 'RENT', cost: byCategory.RENT },
    { id: 3, kind: 'LIVING_COST', cost: sum(Object.keys(byCategory) as FixedCostCategory[]) },
  ];
}

/**
 * Turns capital into the monthly income it could sustain (the "second salary") and measures it against what
 * life costs: the utilities and subscriptions, the rent, and the whole of the monthly costs. Pure: the same capital
 * and costs always give the same answer.
 *
 * `targetMonthlyMinor` is the second salary the person aims at; null (or nothing) when none is set.
 * `costsByCategoryMinor` is the monthly cost per category, in the same currency as the capital; null when no
 * cost is known, in which case there are no milestones to show.
 */
export function wealthMilestones(input: {
  readonly capitalMinor: number;
  readonly costsByCategoryMinor: Readonly<Record<FixedCostCategory, number>> | null;
  readonly targetMonthlyMinor: number | null;
  readonly annualYield?: number;
}): WealthMilestones {
  const annualYield = input.annualYield ?? CONSERVATIVE_REAL_YIELD;
  const salary = secondSalaryMinor(input.capitalMinor, annualYield);

  const milestones = (input.costsByCategoryMinor ? milestoneCosts(input.costsByCategoryMinor) : [])
    .filter(({ cost }) => cost > 0)
    .map(
      ({ id, kind, cost }): Milestone => ({
        id,
        kind,
        monthlyCostMinor: cost,
        capitalNeededMinor: capitalNeededMinor(cost, annualYield),
        reached: salary >= cost,
        progress: clampUnit(salary / cost),
      })
    );

  return {
    secondSalaryMinor: salary,
    milestones,
    reachedMilestone: milestones.filter(({ reached }) => reached).reduce<MilestoneId | null>((highest, { id }) => (highest === null || id > highest ? id : highest), null),
    target:
      input.targetMonthlyMinor !== null && input.targetMonthlyMinor > 0
        ? {
            monthlyMinor: input.targetMonthlyMinor,
            progress: clampUnit(salary / input.targetMonthlyMinor),
            reached: salary >= input.targetMonthlyMinor,
            capitalNeededMinor: capitalNeededMinor(input.targetMonthlyMinor, annualYield),
          }
        : null,
  };
}

export interface CapitalMilestonePacing {
  readonly capitalNeededMinor: number;
  readonly capitalGapMinor: number;
  /** Whole months at the monthly surplus; 0 when achieved, null when the surplus cannot close the gap. */
  readonly monthsRemaining: number | null;
  readonly achieved: boolean;
  /** How much of the capital needed is held, from 0 to 1. */
  readonly progress: number;
}

/**
 * How far a goal is and how long it takes at the current pace: the capital needed is the share of the
 * target the milestone asks for, the gap is what the portfolio lacks, and the months are that gap over the
 * monthly surplus, rounded up. Without a surplus (none, a deficit, or unknown) a gap has no end date.
 */
export function capitalMilestonePacing(input: {
  readonly milestone: Pick<CapitalMilestone, 'targetAmountMinor' | 'capitalRequiredPercentage'>;
  readonly liquidPortfolioMinor: number;
  readonly monthlySurplusMinor: number | null;
}): CapitalMilestonePacing {
  const { milestone, liquidPortfolioMinor, monthlySurplusMinor } = input;
  const capitalNeeded = roundHalfAwayFromZero((milestone.targetAmountMinor * milestone.capitalRequiredPercentage) / 100);
  const capitalGap = Math.max(0, capitalNeeded - liquidPortfolioMinor);
  const monthsRemaining = capitalGap === 0 ? 0 : monthlySurplusMinor !== null && monthlySurplusMinor > 0 ? Math.ceil(capitalGap / monthlySurplusMinor) : null;

  return {
    capitalNeededMinor: capitalNeeded,
    capitalGapMinor: capitalGap,
    monthsRemaining,
    achieved: capitalGap === 0,
    progress: clampUnit(liquidPortfolioMinor / capitalNeeded),
  };
}
