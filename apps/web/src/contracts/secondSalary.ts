// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';
import { calendarDateSchema, currencyCodeSchema } from './primitives';

export const MILESTONE_KIND_VALUES = ['UTILITIES_AND_SUBSCRIPTIONS', 'RENT', 'LIVING_COST'] as const;

export const milestoneDto = z.object({
  id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum(MILESTONE_KIND_VALUES),
  monthlyCostMinor: z.number().int().positive(),
  capitalNeededMinor: z.number().int().nonnegative(),
  reached: z.boolean(),
  /** How much of the cost the second salary covers, from 0 to 1. */
  progress: z.number().min(0).max(1),
  /** Where the cost sits on the bar that ends at the top of the target range, from 0 to 1. */
  position: z.number().min(0).max(1),
});
export type MilestoneDto = z.infer<typeof milestoneDto>;

export const secondSalaryTargetDto = z.object({
  minMonthlyMinor: z.number().int(),
  maxMonthlyMinor: z.number().int(),
  progress: z.number().min(0).max(1),
  minMarker: z.number().min(0).max(1),
  reachedMin: z.boolean(),
  minCapitalNeededMinor: z.number().int().nonnegative(),
  maxCapitalNeededMinor: z.number().int().nonnegative(),
});
export type SecondSalaryTargetDto = z.infer<typeof secondSalaryTargetDto>;

/** Why there are no milestones: the cost of living is only known for the phase being lived, in the portfolio's currency. */
export const SECOND_SALARY_GAPS = ['NO_CURRENT_PHASE', 'NO_COSTS', 'CURRENCY_MISMATCH'] as const;
export type SecondSalaryGap = (typeof SECOND_SALARY_GAPS)[number];

export const secondSalaryQuery = z.object({ asOf: calendarDateSchema.optional() });

export const secondSalaryResponse = z.object({
  asOf: calendarDateSchema,
  /** The currency of the portfolio, and of every amount here. */
  currency: currencyCodeSchema,
  capitalMinor: z.number().int(),
  annualYield: z.number(),
  secondSalaryMinor: z.number().int().nonnegative(),
  milestones: z.array(milestoneDto),
  reachedMilestone: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  /** Set whenever `milestones` is empty. */
  gap: z.enum(SECOND_SALARY_GAPS).nullable(),
  target: secondSalaryTargetDto,
});
export type SecondSalaryResponse = z.infer<typeof secondSalaryResponse>;
