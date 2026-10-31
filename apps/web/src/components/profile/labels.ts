import {
  COST_CADENCES,
  UTILITY_CATEGORIES,
  type CostCadence,
  type EmploymentStatus,
  type FixedCostCategory,
  type HousingTenure,
  type PhaseStatus,
} from '../../contracts';

export const CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  RENT: 'Rent',
  ELECTRICITY: 'Electricity',
  GAS: 'Gas',
  WATER: 'Water',
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

/** How categories are laid out wherever they are picked or listed. Utilities stay together. */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { id: 'rent', label: null, categories: ['RENT'] },
  { id: 'utilities', label: 'Utilities', categories: UTILITY_CATEGORIES },
  { id: 'connectivity', label: null, categories: ['INTERNET', 'PHONE'] },
  { id: 'other', label: null, categories: ['SUBSCRIPTIONS', 'TAXES', 'OTHER'] },
];

export const CADENCE_LABELS: Record<CostCadence, string> = {
  MONTHLY: 'Monthly',
  BIMONTHLY: 'Every 2 months',
  QUARTERLY: 'Quarterly',
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

export const STATUS_LABELS: Record<PhaseStatus, string> = {
  past: 'Past',
  current: 'Current',
  upcoming: 'Upcoming',
};
