import { VARIABLE_COST_CATEGORIES, type CostBasis, type CostCadence, type FixedCostCategory } from '../../contracts';
import { CADENCE_PHRASES } from './labels';

const bills = (count: number) => `${count} ${count === 1 ? 'bill' : 'bills'}`;

/** Where a category's monthly cost comes from, when it comes from bills; null when it is just what was declared. */
export function describeCostBasis(category: FixedCostCategory, basis: CostBasis | null, billCount: number): string | null {
  if (basis !== 'BILLS' && basis !== 'MIXED') return null;
  if ((VARIABLE_COST_CATEGORIES as readonly FixedCostCategory[]).includes(category)) return `Average of ${bills(billCount)}`;

  const latest = billCount === 1 ? 'From your latest bill' : `From your latest ${bills(billCount)}`;
  return basis === 'MIXED' ? `${latest} and what you declared` : latest;
}

/** How often a declared cost is paid, after its amount. Taxes carry no cadence: they are averaged over the entries. */
export function describeDeclaredCadence(category: FixedCostCategory, cadence: CostCadence): string | null {
  return category === 'TAXES' ? null : CADENCE_PHRASES[cadence];
}
