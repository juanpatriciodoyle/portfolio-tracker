import { calendarDateSchema, type IncomeChangeDto, type IncomeReason } from '../../contracts';
import { formatCalendarDate, minorToInputString, parseMajorToMinor } from '../../lib/money';
import { INCOME_REASON_LABELS } from './labels';

/** What the "income change" form holds while it is being filled in. */
export interface IncomeChangeForm {
  startDate: string;
  /** Empty means "until something else changes". */
  endDate: string;
  /** Monthly, in major units as typed. */
  amount: string;
  reason: IncomeReason | null;
}

export type IncomeChangeErrors = Partial<Record<'startDate' | 'endDate' | 'amount', string>>;
export type IncomeChangeResult = { ok: true; change: IncomeChangeDto } | { ok: false; errors: IncomeChangeErrors };

export const emptyIncomeForm = (): IncomeChangeForm => ({ startDate: '', endDate: '', amount: '', reason: null });

export function incomeFormFrom(change: IncomeChangeDto, currency: string): IncomeChangeForm {
  return { startDate: change.startDate, endDate: change.endDate ?? '', amount: minorToInputString(change.amountMinor, currency), reason: change.reason };
}

/** A reason is picked (or picked again to clear it); unemployment suggests no income unless an amount is already there. */
export function withIncomeReason(form: IncomeChangeForm, reason: IncomeReason): IncomeChangeForm {
  if (form.reason === reason) return { ...form, reason: null };
  return { ...form, reason, amount: reason === 'UNEMPLOYMENT' && form.amount.trim() === '' ? '0' : form.amount };
}

export function validateIncomeChange(
  form: IncomeChangeForm,
  currency: string,
  phase: { startDate: string; endDate: string | null }
): IncomeChangeResult {
  const errors: IncomeChangeErrors = {};
  const amountMinor = parseMajorToMinor(form.amount, currency);

  if (!calendarDateSchema.safeParse(form.startDate).success) errors.startDate = 'Pick the day it starts.';
  else if (form.startDate < phase.startDate || (phase.endDate !== null && form.startDate > phase.endDate)) errors.startDate = 'Pick a day while you lived here.';
  if (form.endDate !== '' && !calendarDateSchema.safeParse(form.endDate).success) errors.endDate = 'Enter a real date.';
  else if (form.endDate !== '' && form.startDate !== '' && form.endDate < form.startDate) errors.endDate = 'It cannot end before it starts.';
  if (amountMinor === null) errors.amount = 'Enter an amount such as 3200 or 0.';
  if (Object.keys(errors).length > 0 || amountMinor === null) return { ok: false, errors };

  return { ok: true, change: { startDate: form.startDate, endDate: form.endDate === '' ? null : form.endDate, amountMinor, reason: form.reason } };
}

/** "From Apr 1, 2026" or "Feb 1, 2026 – Feb 28, 2026", and the reason in words when there is one. */
export function describeIncomeChange(change: IncomeChangeDto, locale?: string): { when: string; reason: string | null } {
  const start = formatCalendarDate(change.startDate, locale);
  return {
    when: change.endDate === null ? `From ${start}` : `${start} – ${formatCalendarDate(change.endDate, locale)}`,
    reason: change.reason === null ? null : INCOME_REASON_LABELS[change.reason],
  };
}
