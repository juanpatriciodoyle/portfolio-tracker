import { z } from 'zod';
import {
  HOUSING_TENURES,
  createFixedCostRequest,
  createLivingPhaseRequest,
  updateLivingPhaseRequest,
  type CreateFixedCostRequest,
  type CreateLivingPhaseRequest,
  type IncomeStreamDto,
  type LivingPhaseDto,
  type UpdateLivingPhaseRequest,
} from '../../contracts';
import { parseMajorToMinor } from '../../lib/money';
import { phaseDisplayName } from '../../lib/phaseName';

/** What the editor holds while a person types: everything is text until it is validated. */
export const phaseFormSchema = z.object({
  city: z.string(),
  countryCode: z.string(),
  tenure: z.enum(HOUSING_TENURES),
  currency: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  stillLivingHere: z.boolean(),
  monthlyIncome: z.string(),
  address: z.string(),
  notes: z.string(),
});
export type PhaseFormState = z.infer<typeof phaseFormSchema>;

/** A new phase as it is kept between visits: the answers and the bills added so far. */
export const phaseDraftSchema = z.object({
  form: phaseFormSchema,
  costs: z.array(createFixedCostRequest),
  /** The jobs of the previous home the person unticked, and the amounts they re-typed. Drafts from before this existed read as nothing chosen. */
  carry: z.object({ unticked: z.array(z.string()), amounts: z.record(z.string(), z.string()) }).default({ unticked: [], amounts: {} }),
});

export type PhaseFieldErrors = Partial<Record<keyof PhaseFormState, string>>;

/** Which step of the guided flow asks for each field, so a step can show only its own errors. */
export const PHASE_STEP_FIELDS = {
  place: ['countryCode', 'city', 'address'],
  dates: ['startDate', 'endDate', 'stillLivingHere'],
  money: ['currency', 'tenure', 'monthlyIncome'],
} as const satisfies Record<string, readonly (keyof PhaseFormState)[]>;

export type PhaseStepId = keyof typeof PHASE_STEP_FIELDS;

/** One phase, ready to send either as a new phase or as a change to an existing one. */
export interface PhasePayload {
  create: CreateLivingPhaseRequest;
  update: UpdateLivingPhaseRequest;
}

export type PhaseFormResult = { ok: true; payload: PhasePayload } | { ok: false; errors: PhaseFieldErrors };

export function initialPhaseForm(
  phase: LivingPhaseDto | null,
  defaults: { currency: string; stillLivingHere: boolean }
): PhaseFormState {
  if (phase) {
    return {
      city: phase.city,
      countryCode: phase.countryCode,
      tenure: phase.tenure,
      currency: phase.currency,
      startDate: phase.startDate,
      endDate: phase.endDate ?? '',
      stillLivingHere: phase.endDate === null,
      monthlyIncome: '',
      address: phase.address ?? '',
      notes: phase.notes ?? '',
    };
  }
  return {
    city: '',
    countryCode: '',
    tenure: 'RENT',
    currency: defaults.currency,
    startDate: '',
    endDate: '',
    stillLivingHere: defaults.stillLivingHere,
    monthlyIncome: '',
    address: '',
    notes: '',
  };
}

const REQUIRED_MESSAGES: Partial<Record<keyof PhaseFormState, string>> = {
  city: 'Which city was it?',
  address: 'Keep the address under 200 characters.',
  notes: 'Keep the notes under 500 characters.',
};

/** The contract's field names, mapped onto the form's. */
const FORM_FIELD_FOR_CONTRACT_FIELD: Record<string, keyof PhaseFormState> = { incomeStreams: 'monthlyIncome' };

function isFormField(field: string): field is keyof PhaseFormState {
  return ['city', 'countryCode', 'tenure', 'currency', 'startDate', 'endDate', 'monthlyIncome', 'address', 'notes'].includes(field);
}

/** What the first income typed while adding a home is called; more can be added later, each with its own name. */
const FIRST_INCOME_LABEL = 'Salary';

const FUTURE_MESSAGES = {
  startDate: 'Moved in cannot be a day in the future.',
  endDate: 'Moved out cannot be a day in the future.',
} as const;

/**
 * Checks the form against the same contract the server uses, with messages written for people.
 * Homes are lived in, not planned: both dates are on or before `today`, and moving out comes after moving in.
 */
export function validatePhaseForm(
  form: PhaseFormState,
  today: string,
  fixedCosts: readonly CreateFixedCostRequest[] = [],
  carriedJobs: readonly IncomeStreamDto[] = []
): PhaseFormResult {
  const errors: PhaseFieldErrors = {};

  // Income is optional: nothing typed is a home without income. Further jobs are added from the home itself.
  const monthlyIncomeMinor = form.monthlyIncome.trim() === '' ? 0 : parseMajorToMinor(form.monthlyIncome, form.currency);
  if (monthlyIncomeMinor === null) errors.monthlyIncome = 'Enter an amount such as 3200, or leave it empty.';
  if (form.startDate === '') errors.startDate = 'Add the day you moved in.';
  else if (form.startDate > today) errors.startDate = FUTURE_MESSAGES.startDate;
  if (!form.stillLivingHere) {
    if (form.endDate === '') errors.endDate = 'Add the day you left, or tick "Still living here".';
    else if (form.endDate > today) errors.endDate = FUTURE_MESSAGES.endDate;
    else if (form.startDate !== '' && form.endDate <= form.startDate) errors.endDate = 'Moved out must be after the day you moved in.';
  }
  if (form.countryCode === '') errors.countryCode = 'Choose a country.';

  const fields = {
    name: phaseDisplayName(form),
    city: form.city,
    address: form.address.trim() === '' ? null : form.address,
    countryCode: form.countryCode,
    tenure: form.tenure,
    startDate: form.startDate,
    endDate: form.stillLivingHere ? null : form.endDate,
    currency: form.currency,
    notes: form.notes.trim() === '' ? null : form.notes,
  };
  const incomeStreams: IncomeStreamDto[] =
    monthlyIncomeMinor !== null && monthlyIncomeMinor > 0 && form.startDate !== ''
      ? [{ label: FIRST_INCOME_LABEL, amountMinor: monthlyIncomeMinor, startDate: form.startDate, endDate: null }]
      : [];
  incomeStreams.push(...carriedJobs);

  const parsed = createLivingPhaseRequest.safeParse({ ...fields, incomeStreams, fixedCosts });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const contractField = String(issue.path[0] ?? '');
      const field = FORM_FIELD_FOR_CONTRACT_FIELD[contractField] ?? contractField;
      if (!isFormField(field) || errors[field] !== undefined) continue;
      errors[field] = issue.code === 'too_small' || issue.code === 'invalid_type' ? (REQUIRED_MESSAGES[field] ?? issue.message) : issue.message;
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  // Changing a home never touches its income: that lives in the home's own Income list.
  return { ok: true, payload: { create: parsed.data, update: updateLivingPhaseRequest.parse(fields) } };
}

/** What is wrong with the fields of one step, ignoring every other step. */
export function phaseStepErrors(form: PhaseFormState, today: string, step: PhaseStepId): PhaseFieldErrors {
  const result = validatePhaseForm(form, today);
  if (result.ok) return {};
  const own: readonly string[] = PHASE_STEP_FIELDS[step];
  return Object.fromEntries(Object.entries(result.errors).filter(([field]) => own.includes(field)));
}

const stepOfField = (field: keyof PhaseFormState): PhaseStepId =>
  (Object.keys(PHASE_STEP_FIELDS) as PhaseStepId[]).find((step) => (PHASE_STEP_FIELDS[step] as readonly string[]).includes(field))!;

const hasAnswer = (form: PhaseFormState, field: keyof PhaseFormState) => {
  const value = form[field];
  return typeof value === 'string' && value.trim() !== '';
};

export interface PhaseFeedback {
  /** The message to show under a field now, if any. */
  errorOf: (field: keyof PhaseFormState) => string | undefined;
  /** Whether the field has an answer that passes, for a checkmark. */
  isValid: (field: keyof PhaseFormState) => boolean;
}

/**
 * What a person should see while filling the form: an empty field stays quiet until its step has been
 * tried, but an answer that cannot be right is flagged at once, and one that passes is confirmed.
 */
export function phaseFeedback(form: PhaseFormState, today: string, tried: ReadonlySet<PhaseStepId>): PhaseFeedback {
  const result = validatePhaseForm(form, today);
  const errors: PhaseFieldErrors = result.ok ? {} : result.errors;
  return {
    errorOf: (field) => (hasAnswer(form, field) || tried.has(stepOfField(field)) ? errors[field] : undefined),
    isValid: (field) => hasAnswer(form, field) && errors[field] === undefined,
  };
}
