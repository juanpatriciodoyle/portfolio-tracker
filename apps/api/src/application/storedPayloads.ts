import { z } from 'zod';
import { amountMinorSchema, calendarDateSchema, capitalMilestoneList, incomeStreamSchema, profileDataSchema } from '../contracts';

/** How income was saved before income streams: a base amount that changes replaced for a while. Only read, never written. */
const legacyIncomeChangeSchema = z.object({
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable().default(null),
  amountMinor: amountMinorSchema,
  reason: z.string().nullable().default(null),
});

/** What is sealed inside a living phase row. Phases saved before income streams hold `monthlyIncomeMinor` and `incomeChanges` instead. */
export const phasePayloadSchema = z
  .object({
    name: z.string(),
    city: z.string(),
    address: z.string().nullable(),
    incomeStreams: z.array(incomeStreamSchema).optional(),
    monthlyIncomeMinor: amountMinorSchema.optional(),
    incomeChanges: z.array(legacyIncomeChangeSchema).default([]),
    notes: z.string().nullable(),
  })
  .strict();
export type StoredPhasePayload = z.infer<typeof phasePayloadSchema>;
/** What is written: always streams, never the legacy fields. */
export interface PhasePayload {
  readonly name: string;
  readonly city: string;
  readonly address: string | null;
  readonly incomeStreams: z.infer<typeof incomeStreamSchema>[];
  readonly notes: string | null;
}

/** What is sealed inside a fixed cost row. */
export const costPayloadSchema = z
  .object({
    label: z.string().nullable(),
    amountMinor: amountMinorSchema,
    notes: z.string().nullable(),
    /** Costs saved before they could end have none. */
    endDate: calendarDateSchema.nullable().default(null),
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
