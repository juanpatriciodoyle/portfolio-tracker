import type { MessageKey } from '../../i18n/catalogs';
import type { PhaseStepId } from './phaseForm';

/** What each step of the phase flow asks, in words. */
export const PHASE_STEP_COPY: Record<PhaseStepId, { label: MessageKey; heading: MessageKey }> = {
  place: {
    label: 'phaseStep.place.label',
    heading: 'phaseStep.place.heading',
  },
  dates: {
    label: 'phaseStep.dates.label',
    heading: 'phaseStep.dates.heading',
  },
  money: {
    label: 'phaseStep.money.label',
    heading: 'phaseStep.money.heading',
  },
};
