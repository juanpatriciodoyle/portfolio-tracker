import { z } from 'zod';
import { amountMinorSchema, hasAtLeastOneKey, optionalTextSchema } from './primitives';
import { COST_CADENCES, FIXED_COST_CATEGORIES } from './vocabulary';

export const fixedCostCategorySchema = z.enum(FIXED_COST_CATEGORIES);
export const costCadenceSchema = z.enum(COST_CADENCES);

/** `amountMinor` is what one payment costs, in the phase's currency; `cadence` says how often it is paid. */
export const createFixedCostRequest = z
  .object({
    category: fixedCostCategorySchema,
    cadence: costCadenceSchema,
    amountMinor: amountMinorSchema,
    label: optionalTextSchema(80),
    notes: optionalTextSchema(500),
  })
  .strict();
export type CreateFixedCostRequest = z.infer<typeof createFixedCostRequest>;

export const updateFixedCostRequest = createFixedCostRequest
  .partial()
  .strict()
  .refine(hasAtLeastOneKey, 'Provide at least one field to update');
export type UpdateFixedCostRequest = z.infer<typeof updateFixedCostRequest>;

export const fixedCostDto = z.object({
  id: z.string(),
  category: fixedCostCategorySchema,
  cadence: costCadenceSchema,
  amountMinor: amountMinorSchema,
  label: z.string().nullable(),
  notes: z.string().nullable(),
});
export type FixedCostDto = z.infer<typeof fixedCostDto>;
