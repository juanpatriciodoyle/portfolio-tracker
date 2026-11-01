import type { OnboardingStepId } from './profileDraft';

/** What each step of the first-time flow asks, in words. */
export const ONBOARDING_STEP_COPY: Record<OnboardingStepId, { label: string; heading: string }> = {
  about: {
    label: 'You',
    heading: 'What should we call you?',
  },
  roots: {
    label: 'Roots',
    heading: 'Where are you from?',
  },
  life: {
    label: 'Life',
    heading: 'How do you live day to day?',
  },
};
