import { z } from 'zod';
import { countryCodeSchema } from './primitives';
import { EMPLOYMENT_STATUSES } from './vocabulary';

const allUnique = (values: readonly string[]) => new Set(values).size === values.length;

/**
 * Everything stored about the person, encrypted at rest. Each field exists to enable a concrete
 * insight: age-band and household-type benchmarks, relocation and tax context, income stability.
 */
export const profileDataSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).nullable(),
    birthYear: z.number().int().min(1900).max(2100).nullable(),
    nationalities: z.array(countryCodeSchema).max(5).refine(allUnique, 'Nationalities must be unique'),
    taxResidence: countryCodeSchema.nullable(),
    householdAdults: z.number().int().min(1).max(10),
    dependentChildren: z.number().int().min(0).max(15),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullable(),
  })
  .strict();
export type ProfileData = z.infer<typeof profileDataSchema>;

export const saveProfileRequest = profileDataSchema;
export const profileResponse = profileDataSchema;
