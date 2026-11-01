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
import { HOUSING_TENURES } from './vocabulary';

export const housingTenureSchema = z.enum(HOUSING_TENURES);

/**
 * One source of income: `amountMinor` a month, net, in the living phase's currency, from `startDate` until
 * `endDate` (null while it still pays). Streams of one phase add up day by day and may overlap.
 */
export const incomeStreamSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    amountMinor: amountMinorSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate !== null && value.endDate < value.startDate) {
      ctx.addIssue({ code: 'custom', message: 'An income stream cannot end before it starts', path: ['endDate'] });
    }
  });
export type IncomeStreamDto = z.infer<typeof incomeStreamSchema>;
export type IncomeStreamInput = z.input<typeof incomeStreamSchema>;

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
  /** Jobs and other sources of income; none is fine. Sending the list replaces the one stored. */
  incomeStreams: z.array(incomeStreamSchema).max(50),
  notes: optionalTextSchema(500),
};

/** Creating a phase, today or in the past (backfill). Costs can be sent inline. */
export const createLivingPhaseRequest = z
  .object({
    ...livingPhaseFields,
    endDate: calendarDateSchema.nullable().default(null),
    incomeStreams: z.array(incomeStreamSchema).max(50).default([]),
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
  incomeStreams: z.array(incomeStreamSchema),
  notes: z.string().nullable(),
  fixedCosts: z.array(fixedCostDto),
});
export type LivingPhaseDto = z.infer<typeof livingPhaseDto>;

export const listLivingPhasesResponse = z.object({ phases: z.array(livingPhaseDto) });
export type ListLivingPhasesResponse = z.infer<typeof listLivingPhasesResponse>;

export const idResponse = z.object({ id: z.string() });
export const idsResponse = z.object({ ids: z.array(z.string()) });
