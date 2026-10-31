import {
  createLivingPhaseRequest,
  updateLivingPhaseRequest,
  type CreateLivingPhaseRequest,
  type HousingTenure,
  type LivingPhaseDto,
  type UpdateLivingPhaseRequest,
} from '../../contracts';
import { minorToInputString, parseMajorToMinor } from '../../lib/money';

/** What the editor holds while a person types: everything is text until it is validated. */
export interface PhaseFormState {
  name: string;
  city: string;
  countryCode: string;
  tenure: HousingTenure;
  currency: string;
  startDate: string;
  endDate: string;
  stillLivingHere: boolean;
  monthlyIncome: string;
  address: string;
  notes: string;
}

export type PhaseFieldErrors = Partial<Record<keyof PhaseFormState, string>>;

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
      name: phase.name,
      city: phase.city,
      countryCode: phase.countryCode,
      tenure: phase.tenure,
      currency: phase.currency,
      startDate: phase.startDate,
      endDate: phase.endDate ?? '',
      stillLivingHere: phase.endDate === null,
      monthlyIncome: minorToInputString(phase.monthlyIncomeMinor, phase.currency),
      address: phase.address ?? '',
      notes: phase.notes ?? '',
    };
  }
  return {
    name: '',
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
  name: 'Give this phase a name, for example "Madrid".',
  city: 'Which city was it?',
  address: 'Keep the address under 200 characters.',
  notes: 'Keep the notes under 500 characters.',
};

/** The contract's field names, mapped onto the form's. */
const FORM_FIELD_FOR_CONTRACT_FIELD: Record<string, keyof PhaseFormState> = { monthlyIncomeMinor: 'monthlyIncome' };

function isFormField(field: string): field is keyof PhaseFormState {
  return ['name', 'city', 'countryCode', 'tenure', 'currency', 'startDate', 'endDate', 'monthlyIncome', 'address', 'notes'].includes(field);
}

/** Checks the form against the same contract the server uses, with messages written for people. */
export function validatePhaseForm(form: PhaseFormState): PhaseFormResult {
  const errors: PhaseFieldErrors = {};

  const monthlyIncomeMinor = parseMajorToMinor(form.monthlyIncome, form.currency);
  if (monthlyIncomeMinor === null) errors.monthlyIncome = 'Enter your monthly net income, for example 3200 (0 if none).';
  if (form.startDate === '') errors.startDate = 'Add the day you moved in.';
  if (!form.stillLivingHere && form.endDate === '') errors.endDate = 'Add the day you left, or tick "Still living here".';
  if (form.countryCode === '') errors.countryCode = 'Choose a country.';

  const fields = {
    name: form.name,
    city: form.city,
    address: form.address.trim() === '' ? null : form.address,
    countryCode: form.countryCode,
    tenure: form.tenure,
    startDate: form.startDate,
    endDate: form.stillLivingHere ? null : form.endDate,
    currency: form.currency,
    monthlyIncomeMinor: monthlyIncomeMinor ?? 0,
    notes: form.notes.trim() === '' ? null : form.notes,
  };

  const parsed = createLivingPhaseRequest.safeParse(fields);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const contractField = String(issue.path[0] ?? '');
      const field = FORM_FIELD_FOR_CONTRACT_FIELD[contractField] ?? contractField;
      if (!isFormField(field) || errors[field] !== undefined) continue;
      errors[field] = issue.code === 'too_small' || issue.code === 'invalid_type' ? (REQUIRED_MESSAGES[field] ?? issue.message) : issue.message;
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, payload: { create: parsed.data, update: updateLivingPhaseRequest.parse(fields) } };
}
