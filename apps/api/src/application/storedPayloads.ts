import { z } from 'zod';
import { amountMinorSchema } from '../contracts';

/** What is sealed inside a living phase row. */
export const phasePayloadSchema = z
  .object({
    name: z.string(),
    city: z.string(),
    address: z.string().nullable(),
    monthlyIncomeMinor: amountMinorSchema,
    notes: z.string().nullable(),
  })
  .strict();
export type PhasePayload = z.infer<typeof phasePayloadSchema>;

/** What is sealed inside a fixed cost row. */
export const costPayloadSchema = z
  .object({
    label: z.string().nullable(),
    amountMinor: amountMinorSchema,
    notes: z.string().nullable(),
  })
  .strict();
export type CostPayload = z.infer<typeof costPayloadSchema>;
