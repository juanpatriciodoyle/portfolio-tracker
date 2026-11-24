import { z } from 'zod';
import { localCurrencyOf, type CreateFixedCostRequest, type ProfileData } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { parseMajorToMinor } from '../../lib/money';
import { initialPhaseForm, validatePhaseForm, type PhaseFormState, type PhasePayload } from './phaseForm';

/** The three questions of "Tell us about yourself", in order. Everything else is asked later, from the Demographics card. */
export const ONBOARDING_STEPS = ['place', 'income', 'rent'] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** What the person has answered so far, as text: it is kept as a draft between visits. */
export const onboardingAnswersSchema = z.object({
  countryCode: z.string(),
  city: z.string(),
  currency: z.string(),
  monthlyIncome: z.string(),
  rent: z.string(),
  /** Lives somewhere they pay no rent for (their own home, family, free). */
  paysNoRent: z.boolean(),
  /** The day the person moved in, when it was before today. Empty means today; drafts from before this question read as empty. */
  movedIn: z.string().default(''),
});
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

/** What the first-time flow keeps between visits. */
export const onboardingDraftSchema = z.object({ answers: onboardingAnswersSchema });

export type OnboardingErrors = Partial<Record<keyof OnboardingAnswers, string>>;

/** The answers each step asks for, so a step shows only its own errors. */
export const ONBOARDING_STEP_FIELDS = {
  place: ['countryCode', 'city', 'movedIn'],
  income: ['currency', 'monthlyIncome'],
  rent: ['rent'],
} as const satisfies Record<OnboardingStepId, readonly (keyof OnboardingAnswers)[]>;

export function initialAnswers(currency: string): OnboardingAnswers {
  return { countryCode: '', city: '', currency, monthlyIncome: '', rent: '', paysNoRent: false, movedIn: '' };
}

/** Choosing a country also chooses its currency, unless the country is not one we know the currency of. */
export function chooseCountry(answers: OnboardingAnswers, countryCode: string): OnboardingAnswers {
  return { ...answers, countryCode, currency: localCurrencyOf(countryCode) ?? answers.currency };
}

/** The home the answers describe: lived in since the day given, or since today when none was, and still lived in. */
function phaseFormOf(answers: OnboardingAnswers, today: string): PhaseFormState {
  return {
    ...initialPhaseForm(null, { currency: answers.currency, stillLivingHere: true }),
    city: answers.city,
    countryCode: answers.countryCode,
    // Renting is what "What is your rent?" assumes; not paying rent is anything else.
    tenure: answers.paysNoRent ? 'OTHER' : 'RENT',
    startDate: answers.movedIn.trim() === '' ? today : answers.movedIn,
    monthlyIncome: answers.monthlyIncome,
  };
}

/** The rent as a declared monthly cost; null when there is none to declare. `invalid` when it cannot be read. */
function rentCost(answers: OnboardingAnswers): CreateFixedCostRequest | null | 'invalid' {
  if (answers.paysNoRent || answers.rent.trim() === '') return null;
  const amountMinor = parseMajorToMinor(answers.rent, answers.currency);
  if (amountMinor === null) return 'invalid';
  return amountMinor > 0 ? { category: 'RENT', cadence: 'MONTHLY', amountMinor } : null;
}

export interface OnboardingContext {
  profile: ProfileData;
  /** What the account already greets the person with; never asked again. */
  accountName: string | null;
}

export type OnboardingResult =
  | {
      ok: true;
      phase: PhasePayload;
      /** The profile to save, or null when there is nothing new to put in it. */
      profile: ProfileData | null;
    }
  | { ok: false; errors: OnboardingErrors };

/** Every answer checked against the same contract the server uses, then turned into what is saved. */
export function buildOnboarding(answers: OnboardingAnswers, today: string, { profile, accountName }: OnboardingContext, t: Translate = currentTranslator()): OnboardingResult {
  const rent = rentCost(answers);
  const phase = validatePhaseForm(phaseFormOf(answers, today), today, rent && rent !== 'invalid' ? [rent] : [], [], t);

  const errors: OnboardingErrors = {};
  if (!phase.ok) {
    for (const field of ['countryCode', 'city', 'currency', 'monthlyIncome'] as const) {
      const message = phase.errors[field];
      if (message !== undefined) errors[field] = message;
    }
    // The form calls the day of moving in "startDate"; the question calls it "movedIn".
    if (phase.errors.startDate !== undefined) errors.movedIn = phase.errors.startDate;
  }
  if (rent === 'invalid') errors.rent = t('onboarding.errRent');
  if (!phase.ok || Object.keys(errors).length > 0) return { ok: false, errors };

  const named = profile.fullName === null && accountName !== null && accountName.trim() !== '';
  return { ok: true, phase: phase.payload, profile: named ? { ...profile, fullName: accountName.trim() } : null };
}

/** What is wrong with the answers of one step, ignoring every other step. */
export function onboardingStepErrors(answers: OnboardingAnswers, step: OnboardingStepId, today: string, t: Translate = currentTranslator()): OnboardingErrors {
  const result = buildOnboarding(answers, today, { profile: { fullName: null, birthYear: null, nationalities: [], taxResidence: null, householdAdults: 1, dependentChildren: 0, employmentStatus: null }, accountName: null }, t);
  if (result.ok) return {};
  const own: readonly string[] = ONBOARDING_STEP_FIELDS[step];
  return Object.fromEntries(Object.entries(result.errors).filter(([field]) => own.includes(field)));
}
