import { VARIABLE_COST_CATEGORIES, type CostBasis, type CostCadence, type FixedCostCategory } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { CADENCE_PHRASES } from './labels';

/** Where a category's monthly cost comes from, when it comes from bills; null when it is just what was declared. */
export function describeCostBasis(category: FixedCostCategory, basis: CostBasis | null, billCount: number, t: Translate = currentTranslator()): string | null {
  const bills = t('costs.bills', { count: billCount });
  if (basis !== 'BILLS' && basis !== 'MIXED') return null;
  if ((VARIABLE_COST_CATEGORIES as readonly FixedCostCategory[]).includes(category)) return t('costs.averageOf', { bills });

  const latest = billCount === 1 ? t('costs.latestOne') : t('costs.latestMany', { bills });
  return basis === 'MIXED' ? t('costs.andDeclared', { latest }) : latest;
}

/** How often a declared cost is paid, after its amount. Taxes carry no cadence: they are averaged over the entries. */
export function describeDeclaredCadence(category: FixedCostCategory, cadence: CostCadence, t: Translate = currentTranslator()): string | null {
  return category === 'TAXES' ? null : t(CADENCE_PHRASES[cadence]);
}
