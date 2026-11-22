import {
  BILLING_CADENCES,
  COST_CADENCES,
  UTILITY_CATEGORIES,
  type BillingCadence,
  type CostCadence,
  type EmploymentStatus,
  type FixedCostCategory,
  type FxRateSource,
  type HousingTenure,
  type PhaseStatus,
} from '../../contracts';
import type { MessageKey } from '../../i18n/catalogs';
import type { Translate } from '../../i18n/translate';

/**
 * The words for every kind of thing a living phase has. Each table maps a stored value to a message key, so the
 * wording lives in the catalogs and a screen shows it with `t(TABLE[value])`.
 */
export const CATEGORY_LABELS: Record<FixedCostCategory, MessageKey> = {
  RENT: 'label.category.RENT',
  ELECTRICITY: 'label.category.ELECTRICITY',
  GAS: 'label.category.GAS',
  WATER: 'label.category.WATER',
  HEATING_COOLING: 'label.category.HEATING_COOLING',
  INTERNET: 'label.category.INTERNET',
  PHONE: 'label.category.PHONE',
  SUBSCRIPTIONS: 'label.category.SUBSCRIPTIONS',
  TAXES: 'label.category.TAXES',
  OTHER: 'label.category.OTHER',
};

export interface CategoryGroup {
  id: string;
  /** Shown above the group's chips; null for categories that stand alone. */
  label: MessageKey | null;
  categories: readonly FixedCostCategory[];
}

/** How categories are laid out wherever they are picked or listed, in this order. Utilities stay together. */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { id: 'rent', label: null, categories: ['RENT'] },
  { id: 'utilities', label: 'label.group.utilities', categories: UTILITY_CATEGORIES },
  { id: 'connectivity', label: null, categories: ['INTERNET', 'PHONE'] },
  { id: 'other', label: null, categories: ['SUBSCRIPTIONS', 'TAXES', 'OTHER'] },
];

export const CADENCE_LABELS: Record<CostCadence, MessageKey> = {
  MONTHLY: 'label.cadence.MONTHLY',
  BIMONTHLY: 'label.cadence.BIMONTHLY',
  QUARTERLY: 'label.cadence.QUARTERLY',
  SEMI_ANNUALLY: 'label.cadence.SEMI_ANNUALLY',
  ANNUAL: 'label.cadence.ANNUAL',
};

/** Reads after an amount: "€96 every 2 months". */
export const CADENCE_PHRASES: Record<CostCadence, MessageKey> = {
  MONTHLY: 'label.cadencePhrase.MONTHLY',
  BIMONTHLY: 'label.cadencePhrase.BIMONTHLY',
  QUARTERLY: 'label.cadencePhrase.QUARTERLY',
  SEMI_ANNUALLY: 'label.cadencePhrase.SEMI_ANNUALLY',
  ANNUAL: 'label.cadencePhrase.ANNUAL',
};

export const cadenceOptions = (t: Translate) => COST_CADENCES.map((value) => ({ value, label: t(CADENCE_LABELS[value]) }));

/** Bills as received: the recurring cadences plus a single charge. */
export const BILLING_CADENCE_LABELS: Record<BillingCadence, MessageKey> = { ...CADENCE_LABELS, ONE_OFF: 'label.cadence.ONE_OFF' };

export const BILLING_CADENCE_PHRASES: Record<BillingCadence, MessageKey> = { ...CADENCE_PHRASES, ONE_OFF: 'label.cadencePhrase.ONE_OFF' };

export const billingCadenceOptions = (t: Translate) => BILLING_CADENCES.map((value) => ({ value, label: t(BILLING_CADENCE_LABELS[value]) }));

/** Where an exchange rate came from, in words. BCRA_OFFICIAL is the official Argentine rate, not a market (MEP) rate. */
export const RATE_SOURCE_LABELS: Record<FxRateSource, MessageKey> = {
  BCRA_OFFICIAL: 'label.rate.BCRA_OFFICIAL',
  ECB: 'label.rate.ECB',
  REFERENCE: 'label.rate.REFERENCE',
};

/** The same sources inside a sentence: "converted at the official rate". */
export const RATE_SOURCE_PHRASES: Record<FxRateSource, MessageKey> = {
  BCRA_OFFICIAL: 'label.ratePhrase.BCRA_OFFICIAL',
  ECB: 'label.ratePhrase.ECB',
  REFERENCE: 'label.ratePhrase.REFERENCE',
};

export const TENURE_LABELS: Record<HousingTenure, MessageKey> = {
  RENT: 'label.tenure.RENT',
  OWN: 'label.tenure.OWN',
  FAMILY_OR_FREE: 'label.tenure.FAMILY_OR_FREE',
  OTHER: 'label.tenure.OTHER',
};

export const EMPLOYMENT_LABELS: Record<EmploymentStatus, MessageKey> = {
  EMPLOYEE: 'label.employment.EMPLOYEE',
  SELF_EMPLOYED: 'label.employment.SELF_EMPLOYED',
  UNEMPLOYED: 'label.employment.UNEMPLOYED',
  STUDENT: 'label.employment.STUDENT',
  RETIRED: 'label.employment.RETIRED',
  OTHER: 'label.employment.OTHER',
};

export const STATUS_LABELS: Record<PhaseStatus, MessageKey> = {
  past: 'label.status.past',
  current: 'label.status.current',
  upcoming: 'label.status.upcoming',
};
