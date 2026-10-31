import type { FixedCostCategory } from '../contracts/vocabulary';
import { currencyExponent } from './documentExtraction/currencies';

/** A published point of an income distribution: the value (minor units per period) at a percentile. */
export interface DistributionPoint {
  readonly percentile: number;
  readonly value: number;
}

/**
 * A country's income distribution as its statistics office publishes it. `EQUIVALISED` incomes are per
 * consumption unit (modified OECD scale); `PER_CAPITA` incomes are shared equally by everyone.
 * `period` says what each value covers. Points are ascending in percentile and in value.
 */
export interface IncomeDistribution {
  readonly period: 'MONTH' | 'YEAR';
  readonly basis: 'EQUIVALISED' | 'PER_CAPITA';
  readonly points: readonly DistributionPoint[];
}

export interface Household {
  readonly adults: number;
  readonly children: number;
}

/** Modified OECD equivalence scale: 1 for the first adult, 0.5 for each further adult, 0.3 for each child. */
const equivalenceUnits = ({ adults, children }: Household) => 1 + 0.5 * (adults - 1) + 0.3 * children;

export function incomePerPerson(householdIncomeMinor: number, household: Household, basis: IncomeDistribution['basis']): number {
  const people = basis === 'PER_CAPITA' ? household.adults + household.children : equivalenceUnits(household);
  return Math.round(householdIncomeMinor / people);
}

/** 'EXACT' is a position between two published points; the others only say the income is beyond the published range. */
export type PercentileBound = 'EXACT' | 'AT_MOST' | 'AT_LEAST';

export interface IncomePercentile {
  readonly percentile: number;
  readonly bound: PercentileBound;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Where a household's monthly income sits in the country's distribution, by linear interpolation between the
 * published points. Beyond the first or last point it only says "at most" / "at least": it does not extrapolate.
 */
export function incomePercentile(
  distribution: IncomeDistribution,
  monthlyHouseholdIncomeMinor: number,
  household: Household
): IncomePercentile | null {
  const { points } = distribution;
  if (points.length === 0) return null;

  const perPerson = incomePerPerson(monthlyHouseholdIncomeMinor, household, distribution.basis);
  const value = distribution.period === 'YEAR' ? perPerson * 12 : perPerson;

  const first = points[0];
  const last = points[points.length - 1];
  if (value < first.value) return { percentile: first.percentile, bound: 'AT_MOST' };
  if (value > last.value) return { percentile: last.percentile, bound: 'AT_LEAST' };

  for (let i = 1; i < points.length; i++) {
    const below = points[i - 1];
    const above = points[i];
    if (value <= above.value) {
      const span = above.value - below.value;
      const fraction = span === 0 ? 0 : (value - below.value) / span;
      return { percentile: round1(below.percentile + fraction * (above.percentile - below.percentile)), bound: 'EXACT' };
    }
  }
  return { percentile: last.percentile, bound: 'EXACT' };
}

/** What statistics offices count as housing costs: rent, the utilities and property taxes. Not internet, phone or subscriptions. */
const HOUSING_CATEGORIES: readonly FixedCostCategory[] = ['RENT', 'ELECTRICITY', 'GAS', 'WATER', 'TAXES'];

export function housingCostsMinor(monthlyByCategory: Readonly<Record<FixedCostCategory, number>>): number {
  return HOUSING_CATEGORIES.reduce((total, category) => total + monthlyByCategory[category], 0);
}

/** Housing costs as a percentage of income, one decimal; null when there is no income to compare with. */
export function housingShare(housingMinor: number, incomeMinor: number): number | null {
  return incomeMinor > 0 ? round1((housingMinor / incomeMinor) * 100) : null;
}

/** Within this many percentage points of the typical share counts as "similar". */
export const SIMILAR_SHARE_POINTS = 2;

export interface ShareComparison {
  readonly differencePoints: number;
  readonly verdict: 'LOWER' | 'SIMILAR' | 'HIGHER';
}

export function compareShare(yourShare: number, typicalShare: number): ShareComparison {
  const differencePoints = round1(yourShare - typicalShare);
  const verdict = Math.abs(differencePoints) <= SIMILAR_SHARE_POINTS ? 'SIMILAR' : differencePoints > 0 ? 'HIGHER' : 'LOWER';
  return { differencePoints, verdict };
}

/**
 * An amount in international dollars: what it would buy at average world prices. `lcuPerInternationalDollar` is the
 * World Bank PPP conversion factor of the country. Null when the factor is not a positive number.
 */
export function internationalDollars(amountMinor: number, currency: string, lcuPerInternationalDollar: number): number | null {
  if (!(Number.isFinite(lcuPerInternationalDollar) && lcuPerInternationalDollar > 0)) return null;
  const major = amountMinor / 10 ** currencyExponent(currency);
  return Math.round((major / lcuPerInternationalDollar) * 100) / 100;
}

/** `a` as a multiple of `b`, two decimals; null when `b` is zero. */
export function ratioOf(a: number, b: number): number | null {
  return b === 0 ? null : Math.round((a / b) * 100) / 100;
}
