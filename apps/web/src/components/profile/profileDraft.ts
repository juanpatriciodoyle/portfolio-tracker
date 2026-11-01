import { z } from 'zod';
import { EMPLOYMENT_STATUSES, saveProfileRequest, type ProfileData } from '../../contracts';

/** What the "About you" form holds while a person types. */
export const profileDraftSchema = z.object({
  fullName: z.string(),
  birthYear: z.string(),
  nationalities: z.array(z.string()),
  taxResidence: z.string(),
  householdAdults: z.number().int(),
  dependentChildren: z.number().int(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).or(z.literal('')),
});
export type ProfileDraft = z.infer<typeof profileDraftSchema>;

export type ProfileFieldErrors = Partial<Record<keyof ProfileDraft, string>>;

export type ProfileFormResult = { ok: true; profile: ProfileData } | { ok: false; errors: ProfileFieldErrors };

export function toProfileDraft(profile: ProfileData): ProfileDraft {
  return {
    fullName: profile.fullName ?? '',
    birthYear: profile.birthYear === null ? '' : String(profile.birthYear),
    nationalities: [...profile.nationalities],
    taxResidence: profile.taxResidence ?? '',
    householdAdults: profile.householdAdults,
    dependentChildren: profile.dependentChildren,
    employmentStatus: profile.employmentStatus ?? '',
  };
}

/** True when nothing has been filled in yet, so the page can invite the person to start. */
export function isProfileEmpty(profile: ProfileData): boolean {
  return (
    profile.fullName === null &&
    profile.birthYear === null &&
    profile.nationalities.length === 0 &&
    profile.taxResidence === null &&
    profile.employmentStatus === null
  );
}

function isProfileField(field: string): field is keyof ProfileDraft {
  return ['fullName', 'birthYear', 'nationalities', 'taxResidence', 'householdAdults', 'dependentChildren', 'employmentStatus'].includes(field);
}

export function validateProfileDraft(draft: ProfileDraft): ProfileFormResult {
  const errors: ProfileFieldErrors = {};
  const birthYearText = draft.birthYear.trim();
  let birthYear: number | null = null;
  if (birthYearText !== '') {
    if (/^\d{4}$/.test(birthYearText)) birthYear = Number(birthYearText);
    else errors.birthYear = 'Use a four-digit year such as 1990.';
  }

  const parsed = saveProfileRequest.safeParse({
    fullName: draft.fullName.trim() === '' ? null : draft.fullName,
    birthYear,
    nationalities: draft.nationalities,
    taxResidence: draft.taxResidence === '' ? null : draft.taxResidence,
    householdAdults: draft.householdAdults,
    dependentChildren: draft.dependentChildren,
    employmentStatus: draft.employmentStatus === '' ? null : draft.employmentStatus,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (isProfileField(field) && errors[field] === undefined) errors[field] = issue.message;
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, profile: parsed.data };
}

/** The steps of the first-time flow, and which fields each one asks for. */
export const ONBOARDING_STEP_FIELDS = {
  about: ['fullName', 'birthYear'],
  roots: ['nationalities', 'taxResidence'],
  life: ['employmentStatus', 'householdAdults', 'dependentChildren'],
} as const satisfies Record<string, readonly (keyof ProfileDraft)[]>;

export type OnboardingStepId = keyof typeof ONBOARDING_STEP_FIELDS;

/**
 * What is wrong with one step of the first-time flow. Everything is optional in a profile except that
 * the flow wants a name, so a person who completes it is not asked to start again.
 */
export function onboardingStepErrors(draft: ProfileDraft, step: OnboardingStepId): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const result = validateProfileDraft(draft);
  if (!result.ok) {
    const own: readonly string[] = ONBOARDING_STEP_FIELDS[step];
    for (const [field, message] of Object.entries(result.errors)) if (own.includes(field)) errors[field as keyof ProfileDraft] = message;
  }
  if (step === 'about' && draft.fullName.trim() === '') errors.fullName = 'Tell us what to call you.';
  return errors;
}
