import type { MessageKey } from '../../i18n/catalogs';
import type { OnboardingStepId } from './profileDraft';

/** What each step of the first-time flow asks, in words. */
export const ONBOARDING_STEP_COPY: Record<OnboardingStepId, { label: MessageKey; heading: MessageKey }> = {
  about: {
    label: 'onboarding.about.label',
    heading: 'onboarding.about.heading',
  },
  roots: {
    label: 'onboarding.roots.label',
    heading: 'onboarding.roots.heading',
  },
  life: {
    label: 'onboarding.life.label',
    heading: 'onboarding.life.heading',
  },
};
