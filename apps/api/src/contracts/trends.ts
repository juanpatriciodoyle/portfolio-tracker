import { z } from 'zod';
import { fixedCostCategorySchema } from './fixedCost';
import { calendarDateSchema, currencyCodeSchema } from './primitives';

/**
 * What the bills of a window add up to. `coveredMonths` says how many of the window's months have
 * any bill at all, so "based on 2 of 3 months" can be shown honestly; the average is over those months
 * and is null when there are none.
 */
export const windowAverageDto = z.object({
  windowMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  totalMinor: z.number().int(),
  coveredMonths: z.number().int().nonnegative(),
  averageMinor: z.number().int().nullable(),
});
export type WindowAverageDto = z.infer<typeof windowAverageDto>;

/** Amounts in different currencies are never added together, so each currency gets its own windows. */
export const currencyWindowsDto = z.object({
  currency: currencyCodeSchema,
  windows: z.array(windowAverageDto),
});
export type CurrencyWindowsDto = z.infer<typeof currencyWindowsDto>;

/** What one living phase really cost per month according to its bills, next to what was declared. */
export const phaseObservedDto = z.object({
  phaseId: z.string(),
  name: z.string(),
  currency: currencyCodeSchema,
  coveredMonths: z.number().int().nonnegative(),
  observedMonthlyMinor: z.number().int(),
  declaredMonthlyMinor: z.number().int(),
  /** Observed minus declared: positive means the bills came out higher than the declared costs. */
  driftMinor: z.number().int(),
  byCategoryMinor: z.record(fixedCostCategorySchema, z.number().int()),
});
export type PhaseObservedDto = z.infer<typeof phaseObservedDto>;

export const trendsResponse = z.object({
  asOf: calendarDateSchema,
  /** The newest month the averages use: the last one that is over, as 'YYYY-MM'. */
  lastCompleteMonth: z.string().regex(/^\d{4}-\d{2}$/),
  fixedCosts: z.array(currencyWindowsDto),
  subscriptions: z.array(currencyWindowsDto),
  phases: z.array(phaseObservedDto),
});
export type TrendsResponse = z.infer<typeof trendsResponse>;
