import { FIXED_COST_CATEGORIES, type FixedCostCategory } from '../contracts/vocabulary';
import { InvalidFxRateError, MissingFxRateError } from './errors';
import { roundHalfAwayFromZero } from './money';

/** What a comparison needs to know about one phase (a timeline entry has all of it). */
export interface PhaseSnapshot {
  readonly currency: string;
  readonly monthlyIncomeMinor: number;
  readonly monthlyFixedCostsMinor: number;
  readonly savingsCapacityMinor: number;
  readonly fixedCostsByCategoryMinor: Readonly<Record<FixedCostCategory, number>>;
}

/** The value of one unit of each currency in a common reference currency (the reference itself is 1). */
export type FxRates = Readonly<Record<string, number>>;

export interface ComparisonOptions {
  readonly fx?: FxRates;
  /** The currency the result is reported in; defaults to the later phase's currency. */
  readonly reportingCurrency?: string;
}

export interface CategoryChange {
  readonly category: FixedCostCategory;
  readonly fromMinor: number;
  readonly toMinor: number;
  readonly deltaMinor: number;
}

export interface PhaseComparison {
  readonly currency: string;
  readonly monthlyIncomeDeltaMinor: number;
  readonly monthlyFixedCostsDeltaMinor: number;
  readonly savingsCapacityDeltaMinor: number;
  /** Change in fixed costs as a fraction of the earlier phase's; null when that was zero. */
  readonly fixedCostsDeltaFraction: number | null;
  readonly categories: readonly CategoryChange[];
}

function rateOf(currency: string, fx: FxRates | undefined): number {
  const rate = fx?.[currency];
  if (rate === undefined) throw new MissingFxRateError(currency);
  if (!Number.isFinite(rate) || rate <= 0) throw new InvalidFxRateError(currency);
  return rate;
}

/** Converts minor units between currencies, rounding once; identical currencies need no rates at all. */
function converter(from: string, to: string, fx: FxRates | undefined): (amountMinor: number) => number {
  if (from === to) return (amountMinor) => amountMinor;
  const fromRate = rateOf(from, fx);
  const toRate = rateOf(to, fx);
  return (amountMinor) => roundHalfAwayFromZero((amountMinor * fromRate) / toRate);
}

/** How life changed between two phases: every figure is `to` minus `from`, in one reporting currency. */
export function comparePhases(from: PhaseSnapshot, to: PhaseSnapshot, options: ComparisonOptions = {}): PhaseComparison {
  const currency = options.reportingCurrency ?? to.currency;
  const convertFrom = converter(from.currency, currency, options.fx);
  const convertTo = converter(to.currency, currency, options.fx);

  const fromFixedCosts = convertFrom(from.monthlyFixedCostsMinor);
  const monthlyFixedCostsDeltaMinor = convertTo(to.monthlyFixedCostsMinor) - fromFixedCosts;

  const categories = FIXED_COST_CATEGORIES.filter(
    (category) => from.fixedCostsByCategoryMinor[category] !== 0 || to.fixedCostsByCategoryMinor[category] !== 0
  ).map((category) => {
    const fromMinor = convertFrom(from.fixedCostsByCategoryMinor[category]);
    const toMinor = convertTo(to.fixedCostsByCategoryMinor[category]);
    return { category, fromMinor, toMinor, deltaMinor: toMinor - fromMinor };
  });

  return {
    currency,
    monthlyIncomeDeltaMinor: convertTo(to.monthlyIncomeMinor) - convertFrom(from.monthlyIncomeMinor),
    monthlyFixedCostsDeltaMinor,
    savingsCapacityDeltaMinor: convertTo(to.savingsCapacityMinor) - convertFrom(from.savingsCapacityMinor),
    fixedCostsDeltaFraction: fromFixedCosts > 0 ? monthlyFixedCostsDeltaMinor / fromFixedCosts : null,
    categories,
  };
}
