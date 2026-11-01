import {
  addDays,
  addMonths,
  calendarDateSchema,
  createBillingRecordRequest,
  inferCadenceFromPeriod,
  maxPeriodDays,
  MONTHS_PER_CADENCE,
  periodEndingOn,
  periodFitsCadence,
  suggestForVendor,
  type BillingCadence,
  type BillingRecordDto,
  type CreateBillingRecordRequest,
  type FixedCostCategory,
  type UpdateBillingRecordRequest,
  type VendorHistoryEntry,
} from '../../contracts';
import { minorToInputString, parseMajorToMinor } from '../../lib/money';
import { BILLING_CADENCE_PHRASES } from './labels';

/** What the "Add an expense" form holds while it is being filled in. */
export interface BillForm {
  category: FixedCostCategory | null;
  /** Null until it is picked, suggested, or worked out from the dates. */
  cadence: BillingCadence | null;
  vendor: string;
  /** Major units as typed, such as "96.50". */
  amount: string;
  periodStart: string;
  periodEnd: string;
  /** Which choices the form made for the person, and may therefore change again; a pick of theirs is never overridden. */
  suggested: { category: boolean; cadence: boolean };
}

export type BillField = 'category' | 'vendor' | 'amount' | 'periodStart' | 'periodEnd' | 'cadence';
export type BillErrors = Partial<Record<BillField | 'form', string>>;

export type BillResult = { ok: true; create: CreateBillingRecordRequest } | { ok: false; errors: BillErrors };

/** What the form needs to know about its surroundings to help: today, where the home is, what the person already has. */
export interface BillFormContext {
  /** Today as the server sees it; null until it is known. */
  today: string | null;
  countryCode: string | null;
  history: readonly VendorHistoryEntry[];
}

export const NO_CONTEXT: BillFormContext = { today: null, countryCode: null, history: [] };

const NOTHING_SUGGESTED = { category: false, cadence: false } as const;

export function emptyBillForm(): BillForm {
  return { category: null, cadence: null, vendor: '', amount: '', periodStart: '', periodEnd: '', suggested: NOTHING_SUGGESTED };
}

export function billFormFrom(record: BillingRecordDto): BillForm {
  return {
    category: record.category,
    cadence: record.cadence,
    vendor: record.vendor,
    amount: minorToInputString(record.amountMinor, record.currency),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    suggested: NOTHING_SUGGESTED,
  };
}

const isDate = (value: string) => calendarDateSchema.safeParse(value).success;
const datesAreKnown = (form: BillForm) => isDate(form.periodStart) && isDate(form.periodEnd) && form.periodStart <= form.periodEnd;

/** The days the form's cadence implies when only part of them was given: today, or the one day that was. */
function fillPeriod(form: BillForm, cadence: BillingCadence, today: string | null): Pick<BillForm, 'periodStart' | 'periodEnd'> {
  const { periodStart, periodEnd } = form;
  if (periodStart !== '' && periodEnd !== '') return { periodStart, periodEnd };
  if (periodEnd !== '') return { periodEnd, periodStart: periodEndingOn(cadence, periodEnd).periodStart };
  if (periodStart !== '') {
    const end = cadence === 'ONE_OFF' ? periodStart : addDays(addMonths(periodStart, MONTHS_PER_CADENCE[cadence]), -1);
    return { periodStart, periodEnd: end };
  }
  return today === null ? { periodStart, periodEnd } : periodEndingOn(cadence, today);
}

/** The person picks how often the bill comes; days that are still missing follow from it. */
export function withCadence(form: BillForm, cadence: BillingCadence, context: BillFormContext): BillForm {
  return { ...form, cadence, ...fillPeriod(form, cadence, context.today), suggested: { ...form.suggested, cadence: false } };
}

/** The person picks what the bill is for. */
export function withCategory(form: BillForm, category: FixedCostCategory): BillForm {
  return { ...form, category, suggested: { ...form.suggested, category: false } };
}

/**
 * A date changes. Once both are known, the cadence follows them: it is worked out when none is picked or the
 * last one was only a suggestion, and moves on when the days no longer fit the one the person picked.
 */
export function withPeriod(form: BillForm, field: 'periodStart' | 'periodEnd', value: string): BillForm {
  const next = { ...form, [field]: value };
  if (!datesAreKnown(next)) return next;

  const keeps = next.cadence !== null && !next.suggested.cadence && periodFitsCadence(next.cadence, next.periodStart, next.periodEnd);
  if (keeps) return next;

  const inferred = inferCadenceFromPeriod(next.periodStart, next.periodEnd);
  return inferred === null ? next : { ...next, cadence: inferred, suggested: { ...next.suggested, cadence: true } };
}

/**
 * The name of the sender changes. Unless the person already picked them, the category and how often it comes
 * follow what is known about that sender (see `suggestForVendor`), and the dates follow the cadence.
 */
export function withVendor(form: BillForm, vendor: string, context: BillFormContext): BillForm {
  const suggestion = suggestForVendor({ name: vendor, countryCode: context.countryCode, history: context.history });
  let next: BillForm = { ...form, vendor };

  if (form.category === null || form.suggested.category) {
    next = { ...next, category: suggestion?.category ?? null, suggested: { ...next.suggested, category: suggestion !== null } };
  }

  const cadenceIsOpen = next.cadence === null || next.suggested.cadence;
  const suggestedCadence = suggestion !== null && next.category === suggestion.category ? suggestion.cadence : null;
  if (cadenceIsOpen && suggestedCadence !== null && !datesAreKnown(next)) {
    next = { ...withCadence(next, suggestedCadence, context), suggested: { ...next.suggested, cadence: true } };
  }
  return next;
}

/** Checks the form like a person would, then lets the shared contract have the last word. */
export function validateBill(form: BillForm, phaseId: string, currency: string): BillResult {
  const errors: BillErrors = {};
  const amountMinor = parseMajorToMinor(form.amount, currency);

  if (form.category === null) errors.category = 'Pick what this bill is for.';
  if (form.vendor.trim() === '') errors.vendor = 'Who sent this bill?';
  if (amountMinor === null) errors.amount = 'Enter an amount such as 96 or 96.50.';
  if (form.periodStart === '') errors.periodStart = 'Pick the first day the bill covers.';
  if (form.periodEnd === '') errors.periodEnd = 'Pick the last day the bill covers.';
  if (form.cadence === null) errors.cadence = 'Pick how often this bill comes.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (isDate(form.periodStart) && isDate(form.periodEnd) && form.periodEnd >= form.periodStart && form.cadence !== null) {
    if (!periodFitsCadence(form.cadence, form.periodStart, form.periodEnd)) {
      return {
        ok: false,
        errors: {
          periodEnd: `A bill that comes ${BILLING_CADENCE_PHRASES[form.cadence]} can cover at most ${maxPeriodDays(form.cadence)} days. Pick a longer cadence or shorten the dates.`,
        },
      };
    }
  }

  const parsed = createBillingRecordRequest.safeParse({
    phaseId,
    category: form.category,
    cadence: form.cadence,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    amountMinor,
    vendor: form.vendor,
  });
  if (parsed.success) return { ok: true, create: parsed.data };

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'periodEnd') errors.periodEnd = 'The bill cannot end before it starts.';
    else if (field === 'periodStart') errors.periodStart = 'Enter a real date.';
    else if (field === 'vendor') errors.vendor = 'Keep the name under 80 characters.';
    else if (field === 'amountMinor') errors.amount = 'That amount is too large.';
    else errors.form = 'Check the details and try again.';
  }
  return { ok: false, errors };
}

/** Everything a bill can change; a bill never moves to another phase. */
export function toUpdate(create: CreateBillingRecordRequest): UpdateBillingRecordRequest {
  return {
    category: create.category,
    cadence: create.cadence,
    periodStart: create.periodStart,
    periodEnd: create.periodEnd,
    amountMinor: create.amountMinor,
    vendor: create.vendor,
  };
}
