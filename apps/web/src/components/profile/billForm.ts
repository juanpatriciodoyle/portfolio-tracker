import {
  createBillingRecordRequest,
  type BillingCadence,
  type BillingRecordDto,
  type CreateBillingRecordRequest,
  type FixedCostCategory,
  type UpdateBillingRecordRequest,
} from '../../contracts';
import { minorToInputString, parseMajorToMinor } from '../../lib/money';

/** What the "Log a bill" form holds while it is being filled in. */
export interface BillForm {
  category: FixedCostCategory | null;
  cadence: BillingCadence;
  vendor: string;
  /** Major units as typed, such as "96.50". */
  amount: string;
  periodStart: string;
  periodEnd: string;
}

export type BillField = 'category' | 'vendor' | 'amount' | 'periodStart' | 'periodEnd';
export type BillErrors = Partial<Record<BillField | 'form', string>>;

export type BillResult = { ok: true; create: CreateBillingRecordRequest } | { ok: false; errors: BillErrors };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The whole of the month before `asOf` (a bill is usually logged after it arrives); empty when the day is unknown. */
export function lastMonthPeriod(asOf: string | null): { start: string; end: string } {
  const match = asOf === null ? null : /^(\d{4})-(\d{2})-\d{2}$/.exec(asOf);
  if (!match) return { start: '', end: '' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  return { start: isoDay(new Date(Date.UTC(year, month - 2, 1))), end: isoDay(new Date(Date.UTC(year, month - 1, 0))) };
}

export function emptyBillForm(asOf: string | null): BillForm {
  const { start, end } = lastMonthPeriod(asOf);
  return { category: null, cadence: 'MONTHLY', vendor: '', amount: '', periodStart: start, periodEnd: end };
}

export function billFormFrom(record: BillingRecordDto): BillForm {
  return {
    category: record.category,
    cadence: record.cadence,
    vendor: record.vendor,
    amount: minorToInputString(record.amountMinor, record.currency),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
  };
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
  if (Object.keys(errors).length > 0) return { ok: false, errors };

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
