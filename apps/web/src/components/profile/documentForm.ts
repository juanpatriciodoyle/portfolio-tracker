import type { BillingDraft } from '../../contracts';
import { minorToInputString } from '../../lib/money';
import { emptyBillForm, NO_CONTEXT, validateBill, withPeriod, withVendor, type BillErrors, type BillField, type BillForm, type BillFormContext, type BillResult } from './billForm';

/** The review form is the bill form: what a document did not say starts blank and stays mandatory. */
export type ReviewForm = BillForm;
export type ReviewField = BillField;
export type ReviewErrors = BillErrors;
export type ReviewResult = BillResult;

/**
 * Prefills what the document said, in the chosen phase's currency exponent. What it did not say is helped
 * along without guessing in silence: the cadence follows from the dates, and the category and cadence
 * from what is known about the sender, each still open for the person to change.
 */
export function reviewFormFrom(draft: BillingDraft, currency: string, context: BillFormContext = NO_CONTEXT): ReviewForm {
  const read: ReviewForm = {
    ...emptyBillForm(),
    category: draft.category,
    cadence: draft.cadence,
    vendor: draft.vendor ?? '',
    amount: draft.amountMinor === null ? '' : minorToInputString(draft.amountMinor, currency),
    periodStart: draft.periodStart ?? '',
    periodEnd: draft.periodEnd ?? '',
  };

  const dated = read.cadence === null ? withPeriod(read, 'periodEnd', read.periodEnd) : read;
  // No "today" here: days the document did not state stay blank and flagged, never filled in silently.
  return dated.vendor === '' ? dated : withVendor(dated, dated.vendor, { ...context, today: null });
}

/** The fields the document did not say; the form flags each one until it is filled in. */
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

export const validateReview = validateBill;
