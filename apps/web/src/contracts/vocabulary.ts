// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
/**
 * Shared vocabulary for profile, living phases and fixed costs.
 * Plain constants with no imports, so the domain, the Zod contracts, the Prisma enums and the UI
 * all speak the same words. A test keeps these lists in step with the Prisma enums.
 */

/** A calendar day as 'YYYY-MM-DD': no time of day, no time zone. */
export type CalendarDate = string;

export const FIXED_COST_CATEGORIES = [
  'RENT',
  'ELECTRICITY',
  'GAS',
  'WATER',
  'HEATING_COOLING',
  'INTERNET',
  'PHONE',
  'SUBSCRIPTIONS',
  'TAXES',
  'OTHER',
] as const;
export type FixedCostCategory = (typeof FIXED_COST_CATEGORIES)[number];

/** The categories the UI groups under "Utilities". */
export const UTILITY_CATEGORIES = ['ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING'] as const satisfies readonly FixedCostCategory[];

/** How often a bill is paid. Each cadence covers a whole number of months per payment. */
export const COST_CADENCES = ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUAL'] as const;
export type CostCadence = (typeof COST_CADENCES)[number];

/** Bills as they were actually issued: the recurring cadences, plus a single charge that is not recurring. */
export const BILLING_CADENCES = [...COST_CADENCES, 'ONE_OFF'] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

/**
 * Categories whose bill changes from one period to the next. Their monthly cost is always the average of the
 * bills logged for the living phase; a declared rate is only the starting guess until the first bill arrives.
 */
export const VARIABLE_COST_CATEGORIES = ['ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING', 'TAXES'] as const satisfies readonly FixedCostCategory[];

/** Where a category's monthly cost comes from. MIXED: partly from bills, partly from a rate still only declared. */
export const COST_BASES = ['DECLARED', 'BILLS', 'MIXED'] as const;
export type CostBasis = (typeof COST_BASES)[number];

/** Rolling-average windows, in complete months. */
export const ROLLING_WINDOW_MONTHS = [3, 6, 12] as const;
export type RollingWindowMonths = (typeof ROLLING_WINDOW_MONTHS)[number];

/** Where an exchange rate came from. REFERENCE is a built-in approximate table, used when no live source answers. */
export const FX_RATE_SOURCES = ['ECB', 'BCRA_OFFICIAL', 'REFERENCE'] as const;
export type FxRateSource = (typeof FX_RATE_SOURCES)[number];

export const HOUSING_TENURES = ['RENT', 'OWN', 'FAMILY_OR_FREE', 'OTHER'] as const;
export type HousingTenure = (typeof HOUSING_TENURES)[number];

export const EMPLOYMENT_STATUSES = ['EMPLOYEE', 'SELF_EMPLOYED', 'UNEMPLOYED', 'STUDENT', 'RETIRED', 'OTHER'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Where a living phase sits relative to the "as of" day. */
export const PHASE_STATUSES = ['past', 'current', 'upcoming'] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];
