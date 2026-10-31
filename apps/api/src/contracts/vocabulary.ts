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
  'INTERNET',
  'PHONE',
  'SUBSCRIPTIONS',
  'TAXES',
  'OTHER',
] as const;
export type FixedCostCategory = (typeof FIXED_COST_CATEGORIES)[number];

/** The categories the UI groups under "Utilities". */
export const UTILITY_CATEGORIES = ['ELECTRICITY', 'GAS', 'WATER'] as const satisfies readonly FixedCostCategory[];

/** How often a bill is paid. Each cadence covers a whole number of months per payment. */
export const COST_CADENCES = ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export type CostCadence = (typeof COST_CADENCES)[number];

export const HOUSING_TENURES = ['RENT', 'OWN', 'FAMILY_OR_FREE', 'OTHER'] as const;
export type HousingTenure = (typeof HOUSING_TENURES)[number];

export const EMPLOYMENT_STATUSES = ['EMPLOYEE', 'SELF_EMPLOYED', 'UNEMPLOYED', 'STUDENT', 'RETIRED', 'OTHER'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Where a living phase sits relative to the "as of" day. */
export const PHASE_STATUSES = ['past', 'current', 'upcoming'] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];
