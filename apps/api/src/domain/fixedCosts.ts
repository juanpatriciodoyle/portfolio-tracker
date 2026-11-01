import { FIXED_COST_CATEGORIES, type CostCadence, type FixedCostCategory } from '../contracts/vocabulary';
import { MONTHS_PER_CADENCE } from '../contracts/billingPeriod';
import { roundHalfAwayFromZero } from './money';

/** How many months one payment covers. */
export const MONTHS_PER_PAYMENT = MONTHS_PER_CADENCE;

const MONTHS_PER_YEAR = 12;

export interface FixedCost {
  readonly category: FixedCostCategory;
  readonly cadence: CostCadence;
  /** What one payment costs, in minor units of the phase's currency. */
  readonly amountMinor: number;
}

/**
 * A payment covering N months is worth amount / N per month. Counting in twelfths of a minor unit
 * (amount x 12/N, always a whole number for 1, 2, 3 and 12) keeps every sum exact until the end.
 */
const twelfthsPerMonth = (cost: FixedCost) => cost.amountMinor * (MONTHS_PER_YEAR / MONTHS_PER_PAYMENT[cost.cadence]);

const emptyCategoryTotals = () =>
  Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, 0])) as Record<FixedCostCategory, number>;

/** What the fixed costs add up to per month, rounded once at the end. */
export function monthlyFixedCostBurn(costs: readonly FixedCost[]): number {
  const twelfths = costs.reduce((total, cost) => total + twelfthsPerMonth(cost), 0);
  return roundHalfAwayFromZero(twelfths / MONTHS_PER_YEAR);
}

/**
 * The monthly burn split by category. Rounding is shared out by largest remainder, so the
 * categories always add up exactly to `monthlyFixedCostBurn` (ties go to the earlier category).
 */
export function monthlyBurnByCategory(costs: readonly FixedCost[]): Record<FixedCostCategory, number> {
  const twelfths = emptyCategoryTotals();
  for (const cost of costs) twelfths[cost.category] += twelfthsPerMonth(cost);

  const burn = emptyCategoryTotals();
  let assigned = 0;
  for (const category of FIXED_COST_CATEGORIES) {
    burn[category] = Math.floor(twelfths[category] / MONTHS_PER_YEAR);
    assigned += burn[category];
  }

  const total = monthlyFixedCostBurn(costs);
  const byLargestRemainder = FIXED_COST_CATEGORIES.map((category, order) => ({
    category,
    order,
    remainder: twelfths[category] % MONTHS_PER_YEAR,
  })).sort((a, b) => b.remainder - a.remainder || a.order - b.order);

  for (let extra = 0; extra < total - assigned; extra++) burn[byLargestRemainder[extra].category] += 1;
  return burn;
}

export interface SavingsCapacity {
  /** Income minus fixed costs per month; negative when the costs are larger. */
  readonly capacityMinor: number;
  /** Capacity as a fraction of income; null when there is no income to take a fraction of. */
  readonly savingsRate: number | null;
}

export function baselineSavingsCapacity(input: {
  monthlyIncomeMinor: number;
  monthlyFixedCostsMinor: number;
}): SavingsCapacity {
  const capacityMinor = input.monthlyIncomeMinor - input.monthlyFixedCostsMinor;
  return { capacityMinor, savingsRate: input.monthlyIncomeMinor > 0 ? capacityMinor / input.monthlyIncomeMinor : null };
}
