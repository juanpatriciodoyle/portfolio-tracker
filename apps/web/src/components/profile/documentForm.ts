import type { BillingCadence, BillingDraft, CreateBillingRecordRequest } from '../../contracts';
import { minorToInputString } from '../../lib/money';
import { validateBill, type BillErrors, type BillField, type BillForm } from './billForm';

/** The review form: like the bill form, but a cadence the document did not reveal stays unpicked. */
export type ReviewForm = Omit<BillForm, 'cadence'> & { cadence: BillingCadence | null };
export type ReviewField = BillField | 'cadence';
export type ReviewErrors = BillErrors & { cadence?: string };
export type ReviewResult = { ok: true; create: CreateBillingRecordRequest } | { ok: false; errors: ReviewErrors };

/** Prefills only what the document said; amounts are shown in the chosen phase's currency exponent. */
export function reviewFormFrom(draft: BillingDraft, currency: string): ReviewForm {
  return {
    category: draft.category,
    cadence: draft.cadence,
    vendor: draft.vendor ?? '',
    amount: draft.amountMinor === null ? '' : minorToInputString(draft.amountMinor, currency),
    periodStart: draft.periodStart ?? '',
    periodEnd: draft.periodEnd ?? '',
  };
}

/** The fields the document did not say; the form flags each one and keeps it mandatory. */
export function blankFields(draft: BillingDraft): ReviewField[] {
  const blanks: ReviewField[] = [];
  if (draft.category === null) blanks.push('category');
  if (draft.vendor === null) blanks.push('vendor');
  if (draft.amountMinor === null) blanks.push('amount');
  if (draft.periodStart === null) blanks.push('periodStart');
  if (draft.periodEnd === null) blanks.push('periodEnd');
  if (draft.cadence === null) blanks.push('cadence');
  return blanks;
}

export function validateReview(form: ReviewForm, phaseId: string, currency: string): ReviewResult {
  const result = validateBill({ ...form, cadence: form.cadence ?? 'MONTHLY' }, phaseId, currency);
  const errors: ReviewErrors = result.ok ? {} : { ...result.errors };
  if (form.cadence === null) errors.cadence = 'Pick how often this bill comes.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return result as ReviewResult;
}
