import { z } from 'zod';
import { fixedCostCategorySchema } from './fixedCost';
import { calendarDateSchema, countryCodeSchema, currencyCodeSchema } from './primitives';
import { COST_BASES, FX_RATE_SOURCES, PHASE_STATUSES } from './vocabulary';

/** Whole minor units that may be negative (deficits and deltas). */
const signedMinor = z.number().int();

/** Every category is always present, so the UI never has to guess at a missing key. */
const amountsByCategory = z.record(fixedCostCategorySchema, signedMinor);

export const timelineEntryDto = z.object({
  phaseId: z.string(),
  name: z.string(),
  city: z.string(),
  countryCode: countryCodeSchema,
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable(),
  status: z.enum(PHASE_STATUSES),
  currency: currencyCodeSchema,
  monthlyIncomeMinor: signedMinor,
  monthlyFixedCostsMinor: signedMinor,
  /** Income minus fixed costs, per month. Negative when fixed costs exceed income. */
  savingsCapacityMinor: signedMinor,
  /** Savings capacity as a fraction of income; null when there is no income. */
  savingsRate: z.number().nullable(),
  fixedCostsByCategoryMinor: amountsByCategory,
  /** Where each category's cost comes from (null: nothing declared or billed) and how many bills it was worked out from. */
  costBasisByCategory: z.record(
    fixedCostCategorySchema,
    z.object({ basis: z.enum(COST_BASES).nullable(), billCount: z.number().int().nonnegative() })
  ),
  /** Months lived in the phase up to the "as of" day (0 for upcoming phases). */
  months: z.number().nonnegative(),
  totalIncomeMinor: signedMinor,
  totalFixedCostsMinor: signedMinor,
});
export type TimelineEntryDto = z.infer<typeof timelineEntryDto>;

export const timelineResponse = z.object({
  asOf: calendarDateSchema,
  entries: z.array(timelineEntryDto),
});
export type TimelineResponse = z.infer<typeof timelineResponse>;

export const phaseComparisonResponse = z.discriminatedUnion('comparable', [
  z.object({
    comparable: z.literal(true),
    fromPhaseId: z.string(),
    toPhaseId: z.string(),
    currency: currencyCodeSchema,
    monthlyIncomeDeltaMinor: signedMinor,
    monthlyFixedCostsDeltaMinor: signedMinor,
    savingsCapacityDeltaMinor: signedMinor,
    /** Change in fixed costs as a fraction of the earlier phase's; null when that was zero. */
    fixedCostsDeltaFraction: z.number().nullable(),
    categories: z.array(
      z.object({
        category: fixedCostCategorySchema,
        fromMinor: signedMinor,
        toMinor: signedMinor,
        deltaMinor: signedMinor,
      })
    ),
    /** Only when currencies were converted: where each rate came from (BCRA_OFFICIAL is the official Argentine rate). */
    rateSources: z.array(z.object({ currency: currencyCodeSchema, source: z.enum(FX_RATE_SOURCES) })).optional(),
  }),
  z.object({
    comparable: z.literal(false),
    reason: z.literal('FX_REQUIRED'),
    currencies: z.tuple([currencyCodeSchema, currencyCodeSchema]),
  }),
]);
export type PhaseComparisonResponse = z.infer<typeof phaseComparisonResponse>;
