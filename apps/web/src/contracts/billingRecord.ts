// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';
import { periodFitsCadence, maxPeriodDays } from './billingPeriod';
import { fixedCostCategorySchema } from './fixedCost';
import { amountMinorSchema, calendarDateSchema, currencyCodeSchema, hasAtLeastOneKey, optionalTextSchema } from './primitives';
import { BILLING_CADENCES } from './vocabulary';

export const billingCadenceSchema = z.enum(BILLING_CADENCES);

const billingRecordFields = {
  category: fixedCostCategorySchema,
  cadence: billingCadenceSchema,
  /** The first and last day the bill covers (both included). */
  periodStart: calendarDateSchema,
  periodEnd: calendarDateSchema,
  amountMinor: amountMinorSchema,
  vendor: z.string().trim().min(1).max(80),
  notes: optionalTextSchema(500),
};

/** One bill actually received for a living phase, in that phase's currency. */
export const createBillingRecordRequest = z
  .object({ phaseId: z.string().min(1).max(100), ...billingRecordFields })
  .strict()
  .superRefine((value, ctx) => {
    if (value.periodEnd < value.periodStart) {
      ctx.addIssue({ code: 'custom', message: 'The period cannot end before it starts', path: ['periodEnd'] });
    } else if (!periodFitsCadence(value.cadence, value.periodStart, value.periodEnd)) {
      ctx.addIssue({
        code: 'custom',
        message: `A ${value.cadence} bill cannot cover more than ${maxPeriodDays(value.cadence)} days`,
        path: ['periodEnd'],
      });
    }
  });
export type CreateBillingRecordRequest = z.infer<typeof createBillingRecordRequest>;

/** Changing a bill: absent fields stay, null clears the notes. A bill cannot move to another phase. */
export const updateBillingRecordRequest = z
  .object(billingRecordFields)
  .partial()
  .strict()
  .refine(hasAtLeastOneKey, 'Provide at least one field to update');
export type UpdateBillingRecordRequest = z.infer<typeof updateBillingRecordRequest>;

export const billingRecordDto = z.object({
  id: z.string(),
  phaseId: z.string(),
  ...billingRecordFields,
  notes: z.string().nullable(),
  currency: currencyCodeSchema,
});
export type BillingRecordDto = z.infer<typeof billingRecordDto>;

export const listBillingRecordsResponse = z.object({ records: z.array(billingRecordDto) });
export type ListBillingRecordsResponse = z.infer<typeof listBillingRecordsResponse>;
