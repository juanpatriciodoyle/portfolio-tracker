import type { LivingPhaseDto } from '../../contracts';
import type { ApiFailure } from '../../lib/apiErrors';
import { describeFailure, issuesByField } from './failureMessage';
import type { PhaseFieldErrors, PhaseFormState } from './phaseForm';

/** The server's field names, mapped onto the form's. */
const FORM_FIELD_FOR_SERVER_FIELD: Record<string, string> = { incomeStreams: 'monthlyIncome' };

const FORM_FIELDS: readonly string[] = ['city', 'countryCode', 'tenure', 'currency', 'startDate', 'endDate', 'monthlyIncome', 'address', 'notes'];

export interface PhaseFailureFeedback {
  /** Problems the server pinned to a field of the form. */
  fieldErrors: PhaseFieldErrors;
  /** A sentence for everything else, such as dates that overlap another phase; null when fields explain it. */
  message: string | null;
}

/** Splits a failed save into what belongs under a field and what needs a sentence of its own. */
export function phaseFailureFeedback(failure: ApiFailure, phases: readonly LivingPhaseDto[]): PhaseFailureFeedback {
  const fieldErrors: PhaseFieldErrors = {};
  for (const [field, message] of Object.entries(issuesByField(failure))) {
    const formField = FORM_FIELD_FOR_SERVER_FIELD[field] ?? field;
    if (FORM_FIELDS.includes(formField)) fieldErrors[formField as keyof PhaseFormState] = message;
  }
  return Object.keys(fieldErrors).length > 0 ? { fieldErrors, message: null } : { fieldErrors: {}, message: describeFailure(failure, phases) };
}
