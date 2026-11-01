import {
  BILLING_CADENCES,
  COST_CADENCES,
  INCOME_REASONS,
  UTILITY_CATEGORIES,
  type BillingCadence,
  type CostCadence,
  type EmploymentStatus,
  type FixedCostCategory,
  type FxRateSource,
  type HousingTenure,
  type IncomeReason,
  type PhaseStatus,
} from '../../contracts';

export const CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  RENT: 'Rent',
  ELECTRICITY: 'Electricity',
  GAS: 'Gas',
  WATER: 'Water',
  HEATING_COOLING: 'Heating / cooling',
  INTERNET: 'Internet',
  PHONE: 'Phone',
  SUBSCRIPTIONS: 'Subscriptions',
  TAXES: 'Taxes',
  OTHER: 'Other',
};

export interface CategoryGroup {
  id: string;
  /** Shown above the group's chips; null for categories that stand alone. */
  label: string | null;
  categories: readonly FixedCostCategory[];
}

/** How categories are laid out wherever they are picked or listed, in this order. Utilities stay together. */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { id: 'rent', label: null, categories: ['RENT'] },
  { id: 'utilities', label: 'Utilities', categories: UTILITY_CATEGORIES },
  { id: 'connectivity', label: null, categories: ['INTERNET', 'PHONE'] },
  { id: 'other', label: null, categories: ['SUBSCRIPTIONS', 'TAXES', 'OTHER'] },
];

export const CADENCE_LABELS: Record<CostCadence, string> = {
  MONTHLY: 'Monthly',
  BIMONTHLY: 'Every 2 months',
  QUARTERLY: 'Every 3 months',
  ANNUAL: 'Yearly',
};

/** Reads after an amount: "€96 every 2 months". */
export const CADENCE_PHRASES: Record<CostCadence, string> = {
  MONTHLY: 'every month',
  BIMONTHLY: 'every 2 months',
  QUARTERLY: 'every 3 months',
  ANNUAL: 'every year',
};

export const CADENCE_OPTIONS = COST_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }));

/** Bills as received: the recurring cadences plus a single charge. */
export const BILLING_CADENCE_LABELS: Record<BillingCadence, string> = { ...CADENCE_LABELS, ONE_OFF: 'One-off' };

export const BILLING_CADENCE_PHRASES: Record<BillingCadence, string> = { ...CADENCE_PHRASES, ONE_OFF: 'one-off' };

export const BILLING_CADENCE_OPTIONS = BILLING_CADENCES.map((value) => ({ value, label: BILLING_CADENCE_LABELS[value] }));

/** Where an exchange rate came from, in words. BCRA_OFFICIAL is the official Argentine rate, not a market (MEP) rate. */
export const RATE_SOURCE_LABELS: Record<FxRateSource, string> = {
  BCRA_OFFICIAL: 'Official rate',
  ECB: 'ECB rate',
  REFERENCE: 'Approximate rate',
};

/** The same sources inside a sentence: "converted at the official rate". */
export const RATE_SOURCE_PHRASES: Record<FxRateSource, string> = {
  BCRA_OFFICIAL: 'the official rate',
  ECB: 'the ECB rate',
  REFERENCE: 'the approximate rate',
};

export const TENURE_LABELS: Record<HousingTenure, string> = {
  RENT: 'Renting',
  OWN: 'Owning',
  FAMILY_OR_FREE: 'Family or free housing',
  OTHER: 'Other',
};

export const EMPLOYMENT_LABELS: Record<EmploymentStatus, string> = {
  EMPLOYEE: 'Employed',
  SELF_EMPLOYED: 'Self-employed',
  UNEMPLOYED: 'Between jobs',
  STUDENT: 'Student',
  RETIRED: 'Retired',
  OTHER: 'Other',
};

export const INCOME_REASON_LABELS: Record<IncomeReason, string> = {
  PROMOTION: 'Promotion',
  NEW_JOB: 'New job',
  UNEMPLOYMENT: 'Unemployment',
  OTHER: 'Other',
};

export const INCOME_REASON_OPTIONS = INCOME_REASONS.map((value) => ({ value, label: INCOME_REASON_LABELS[value] }));

export const STATUS_LABELS: Record<PhaseStatus, string> = {
  past: 'Past',
  current: 'Current',
  upcoming: 'Upcoming',
};
