import { useMemo, useState } from 'react';
import {
  PHASE_STEP_FIELDS,
  phaseFeedback,
  phaseStepErrors,
  type PhaseFieldErrors,
  type PhaseFormState,
  type PhaseStepId,
} from './phaseForm';

const STEP_IDS = Object.keys(PHASE_STEP_FIELDS) as PhaseStepId[];

/** The step that asks for a field. */
export function stepOfPhaseField(field: keyof PhaseFormState): PhaseStepId | undefined {
  return STEP_IDS.find((step) => (PHASE_STEP_FIELDS[step] as readonly string[]).includes(field));
}

/**
 * What a guided phase form shows as it is filled in: errors for steps that were tried or answers that
 * cannot be right, checkmarks for answers that pass, and whatever the server said about a field.
 */
export function usePhaseFormFeedback(form: PhaseFormState, today: string) {
  const [tried, setTried] = useState<ReadonlySet<PhaseStepId>>(new Set());
  const [serverErrors, setServerErrors] = useState<PhaseFieldErrors>({});
  const feedback = useMemo(() => phaseFeedback(form, today, tried), [form, today, tried]);

  return {
    errorOf: (field: keyof PhaseFormState) => serverErrors[field] ?? feedback.errorOf(field),
    isValid: (field: keyof PhaseFormState) => serverErrors[field] === undefined && feedback.isValid(field),
    /** Marks a step as tried, so its empty fields start asking, and says what is still wrong with it. */
    tryStep: (step: PhaseStepId): PhaseFieldErrors => {
      setTried((previous) => new Set(previous).add(step));
      return phaseStepErrors(form, today, step);
    },
    tryEverything: () => setTried(new Set(STEP_IDS)),
    showServerErrors: setServerErrors,
    clearServerErrors: () => setServerErrors((previous) => (Object.keys(previous).length > 0 ? {} : previous)),
  };
}

export type PhaseFormFeedback = ReturnType<typeof usePhaseFormFeedback>;

/** The first step, in flow order, that owns a field with an error. */
export function firstStepWithError(errors: PhaseFieldErrors): PhaseStepId | undefined {
  const failing = new Set(Object.keys(errors));
  return STEP_IDS.find((step) => (PHASE_STEP_FIELDS[step] as readonly string[]).some((field) => failing.has(field)));
}
