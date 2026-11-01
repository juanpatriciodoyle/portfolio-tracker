import type { PhaseStepId } from './phaseForm';

export type PhaseFlowStepId = PhaseStepId | 'bills';

/** What each step of the phase flow asks, in words. */
export const PHASE_STEP_COPY: Record<PhaseFlowStepId, { label: string; heading: string; hint: string }> = {
  place: {
    label: 'Where',
    heading: 'Where did you live?',
    hint: 'A home you lived in, or live in now. We name it from the place, so there is nothing to type up.',
  },
  dates: {
    label: 'When',
    heading: 'When were you there?',
    hint: 'Dates are days that have already happened.',
  },
  money: {
    label: 'Money',
    heading: 'What came in each month?',
    hint: 'This is how we work out what was left after your bills.',
  },
  bills: {
    label: 'Bills',
    heading: 'What do you pay every month?',
    hint: 'Optional. Add rent and utilities now, or any time later from the home itself.',
  },
};
