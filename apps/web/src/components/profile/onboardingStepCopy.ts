import type { OnboardingStepId } from './profileDraft';

/** What each step of the first-time flow asks, in words. */
export const ONBOARDING_STEP_COPY: Record<OnboardingStepId, { label: string; heading: string; hint: string }> = {
  about: {
    label: 'You',
    heading: 'What should we call you?',
    hint: 'Everything you tell us about yourself is stored encrypted.',
  },
  roots: {
    label: 'Roots',
    heading: 'Where are you from?',
    hint: 'Nationalities and where you pay tax let us compare you with people in your situation. Skip what you like.',
  },
  life: {
    label: 'Life',
    heading: 'How do you live day to day?',
    hint: 'Household and work shape what a fair comparison looks like.',
  },
};
