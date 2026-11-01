// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';
import { createFixedCostRequest, fixedCostDto } from './fixedCost';
import {
  amountMinorSchema,
  calendarDateSchema,
  countryCodeSchema,
  currencyCodeSchema,
  hasAtLeastOneKey,
  optionalTextSchema,
} from './primitives';
import { HOUSING_TENURES, INCOME_REASONS } from './vocabulary';

export const housingTenureSchema = z.enum(HOUSING_TENURES);
export const incomeReasonSchema = z.enum(INCOME_REASONS);

/**
 * From `startDate` the monthly income is `amountMinor` (0 for a stretch without work), until `endDate` or, when
 * that is null, until a later change takes over or the phase ends.
 */
export const incomeChangeSchema = z
  .object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.nullable().default(null),
    amountMinor: amountMinorSchema,
    reason: incomeReasonSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate !== null && value.endDate < value.startDate) {
      ctx.addIssue({ code: 'custom', message: 'An income change cannot end before it starts', path: ['endDate'] });
    }
  });
export type IncomeChangeDto = z.infer<typeof incomeChangeSchema>;
export type IncomeChangeInput = z.input<typeof incomeChangeSchema>;

const livingPhaseFields = {
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  address: optionalTextSchema(200),
  countryCode: countryCodeSchema,
  tenure: housingTenureSchema,
  startDate: calendarDateSchema,
  /** null means "still living here": the current phase. */
  endDate: calendarDateSchema.nullable(),
  currency: currencyCodeSchema,
  /** What came in each month before any income change. */
  monthlyIncomeMinor: amountMinorSchema,
  /** Raises, new jobs and stretches without work. Sending the list replaces the one stored. */
  incomeChanges: z.array(incomeChangeSchema).max(50),
  notes: optionalTextSchema(500),
};

/** Creating a phase, today or in the past (backfill). Costs can be sent inline. */
export const createLivingPhaseRequest = z
  .object({
    ...livingPhaseFields,
    endDate: calendarDateSchema.nullable().default(null),
    incomeChanges: z.array(incomeChangeSchema).max(50).default([]),
    fixedCosts: z.array(createFixedCostRequest).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate !== null && value.endDate < value.startDate) {
      ctx.addIssue({ code: 'custom', message: 'End date cannot be before the start date', path: ['endDate'] });
    }
  });
export type CreateLivingPhaseRequest = z.infer<typeof createLivingPhaseRequest>;
export type CreateLivingPhaseInput = z.input<typeof createLivingPhaseRequest>;

/** Changing a phase: absent fields stay as they are, null clears the optional ones. */
export const updateLivingPhaseRequest = z
  .object(livingPhaseFields)
  .partial()
  .strict()
  .refine(hasAtLeastOneKey, 'Provide at least one field to update');
export type UpdateLivingPhaseRequest = z.infer<typeof updateLivingPhaseRequest>;

/** Enter a whole history at once; it is validated as a set and saved all-or-nothing. */
export const backfillLivingPhasesRequest = z.object({ phases: z.array(createLivingPhaseRequest).min(1).max(50) }).strict();
export type BackfillLivingPhasesRequest = z.infer<typeof backfillLivingPhasesRequest>;

export const livingPhaseDto = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string().nullable(),
  countryCode: countryCodeSchema,
  tenure: housingTenureSchema,
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable(),
  currency: currencyCodeSchema,
  monthlyIncomeMinor: amountMinorSchema,
  incomeChanges: z.array(incomeChangeSchema),
  notes: z.string().nullable(),
  fixedCosts: z.array(fixedCostDto),
});
export type LivingPhaseDto = z.infer<typeof livingPhaseDto>;

export const listLivingPhasesResponse = z.object({ phases: z.array(livingPhaseDto) });
export type ListLivingPhasesResponse = z.infer<typeof listLivingPhasesResponse>;

export const idResponse = z.object({ id: z.string() });
export const idsResponse = z.object({ ids: z.array(z.string()) });
