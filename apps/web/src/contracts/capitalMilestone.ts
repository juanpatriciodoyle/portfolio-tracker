// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';
import { calendarDateSchema, currencyCodeSchema, MAX_AMOUNT_MINOR } from './primitives';

export const CAPITAL_MILESTONE_CATEGORIES = ['PROPERTY', 'SABBATICAL', 'VENTURE', 'CUSTOM'] as const;
export type CapitalMilestoneCategory = (typeof CAPITAL_MILESTONE_CATEGORIES)[number];

/** How much of the target must be held as capital: a deposit for a property, the whole sum for a cash reserve. */
export const DEFAULT_CAPITAL_REQUIRED_PERCENTAGE: Readonly<Record<CapitalMilestoneCategory, number>> = {
  PROPERTY: 30,
  SABBATICAL: 100,
  VENTURE: 100,
  CUSTOM: 100,
};

export const MAX_CAPITAL_MILESTONES = 3;

/** A goal the person saves toward. Off until it is configured; stored encrypted with the profile. */
export const capitalMilestoneSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().trim().min(1).max(60),
    targetAmountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
    capitalRequiredPercentage: z.number().int().min(1).max(100),
    category: z.enum(CAPITAL_MILESTONE_CATEGORIES),
    enabled: z.boolean().default(false),
  })
  .strict();
export type CapitalMilestone = z.infer<typeof capitalMilestoneSchema>;

export const capitalMilestoneList = z
  .array(capitalMilestoneSchema)
  .max(MAX_CAPITAL_MILESTONES)
  .refine((milestones) => new Set(milestones.map(({ id }) => id)).size === milestones.length, 'Milestone ids must be unique');

/** Replaces the whole list. */
export const saveCapitalMilestonesRequest = z.object({ milestones: capitalMilestoneList }).strict();
export type SaveCapitalMilestonesRequest = z.infer<typeof saveCapitalMilestonesRequest>;

/** A milestone with how far the capital is from it. */
export const capitalMilestonePacingDto = capitalMilestoneSchema.extend({
  capitalNeededMinor: z.number().int().nonnegative(),
  capitalGapMinor: z.number().int().nonnegative(),
  /** Whole months at the current monthly surplus; 0 when achieved, null when the surplus cannot close the gap. */
  monthsRemaining: z.number().int().nonnegative().nullable(),
  achieved: z.boolean(),
  progress: z.number().min(0).max(1),
});
export type CapitalMilestonePacingDto = z.infer<typeof capitalMilestonePacingDto>;

/** Why the pace is unknown: it needs the phase being lived, in the portfolio's currency. */
export const CAPITAL_HORIZON_GAPS = ['NO_CURRENT_PHASE', 'CURRENCY_MISMATCH'] as const;
export type CapitalHorizonGap = (typeof CAPITAL_HORIZON_GAPS)[number];

export const capitalHorizonQuery = z.object({ asOf: calendarDateSchema.optional() });

export const capitalHorizonResponse = z.object({
  asOf: calendarDateSchema,
  /** The currency of the portfolio, and of every amount here. */
  currency: currencyCodeSchema,
  liquidPortfolioMinor: z.number().int(),
  /** Income minus every monthly cost of the phase being lived; null when `gap` is set. */
  monthlySurplusMinor: z.number().int().nullable(),
  gap: z.enum(CAPITAL_HORIZON_GAPS).nullable(),
  milestones: z.array(capitalMilestonePacingDto),
});
export type CapitalHorizonResponse = z.infer<typeof capitalHorizonResponse>;
