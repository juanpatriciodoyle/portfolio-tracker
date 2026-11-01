import type { PhaseStepId } from './phaseForm';

export type PhaseFlowStepId = PhaseStepId | 'bills';

/** What each step of the phase flow asks, in words. */
export const PHASE_STEP_COPY: Record<PhaseFlowStepId, { label: string; heading: string }> = {
  place: {
    label: 'Where',
    heading: 'Where did you live?',
  },
  dates: {
    label: 'When',
    heading: 'When were you there?',
  },
  money: {
    label: 'Money',
    heading: 'What came in each month?',
  },
  bills: {
    label: 'Bills',
    heading: 'What do you pay every month?',
  },
};
