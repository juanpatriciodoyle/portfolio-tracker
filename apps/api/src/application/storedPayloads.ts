import { z } from 'zod';
import { amountMinorSchema, capitalMilestoneList, incomeChangeSchema, profileDataSchema } from '../contracts';

/** What is sealed inside a living phase row. */
export const phasePayloadSchema = z
  .object({
    name: z.string(),
    city: z.string(),
    address: z.string().nullable(),
    monthlyIncomeMinor: amountMinorSchema,
    /** Phases saved before income changes existed have none. */
    incomeChanges: z.array(incomeChangeSchema).default([]),
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

/** What is sealed inside a billing record row. */
export const billingPayloadSchema = z
  .object({
    vendor: z.string(),
    amountMinor: amountMinorSchema,
    notes: z.string().nullable(),
  })
  .strict();
export type BillingPayload = z.infer<typeof billingPayloadSchema>;

/** What is sealed inside the profile row: the profile itself and the goals saved toward. Profiles saved before goals existed have none. */
export const storedProfileSchema = profileDataSchema.extend({ capitalMilestones: capitalMilestoneList.default([]) });
export type StoredProfile = z.infer<typeof storedProfileSchema>;
