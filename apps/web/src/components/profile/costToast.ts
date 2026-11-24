import type { BillingCadence, FixedCostCategory } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { displayLocale, formatMinor, formatPercent } from '../../lib/money';
import { CATEGORY_LABELS } from './labels';

const MONTHS_PER_PAYMENT: Record<Exclude<BillingCadence, 'ONE_OFF'>, number> = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, SEMI_ANNUALLY: 6, ANNUAL: 12 };

/** What one payment costs each month, in minor units; null for something paid once. */
export function monthlyAmountMinor(amountMinor: number, cadence: BillingCadence): number | null {
  return cadence === 'ONE_OFF' ? null : Math.round(amountMinor / MONTHS_PER_PAYMENT[cadence]);
}

export interface CostAdded {
  category: FixedCostCategory;
  amountMinor: number;
  cadence: BillingCadence;
  currency: string;
  /** The share of income kept after fixed costs (a fraction) before and after, from the timeline; null when there is no income to take a share of. */
  keptBefore: number | null;
  keptAfter: number | null;
}

/** "Electricity €62/month added. You now keep 67% (was 69%).": what happened, and what it did to what the person keeps. */
export function describeCostAdded(added: CostAdded, locale: string = displayLocale(), t: Translate = currentTranslator()): string {
  const monthly = monthlyAmountMinor(added.amountMinor, added.cadence);
  const name = t(CATEGORY_LABELS[added.category]);
  const what =
    monthly === null
      ? t('toast.addedOnce', { name, amount: formatMinor(added.amountMinor, added.currency, locale) })
      : t('toast.added', { name, amount: formatMinor(monthly, added.currency, locale) });

  const { keptBefore, keptAfter } = added;
  if (keptBefore === null || keptAfter === null) return what;
  const [before, after] = [formatPercent(keptBefore, locale), formatPercent(keptAfter, locale)];
  return before === after ? what : `${what} ${t('toast.kept', { after, before })}`;
}
