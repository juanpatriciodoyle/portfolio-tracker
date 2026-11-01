import { calendarDateSchema, type IncomeStreamDto } from '../../contracts';
import { formatCalendarDate, minorToInputString, parseMajorToMinor } from '../../lib/money';

/** What the "income stream" form holds while it is being filled in. */
export interface IncomeStreamForm {
  /** The job or source: "Salary", "Freelance consulting". */
  label: string;
  /** Monthly net, in major units as typed. */
  amount: string;
  startDate: string;
  /** Empty means it is still paying. */
  endDate: string;
}

export type IncomeStreamErrors = Partial<Record<'label' | 'amount' | 'startDate' | 'endDate', string>>;
export type IncomeStreamResult = { ok: true; stream: IncomeStreamDto } | { ok: false; errors: IncomeStreamErrors };

/** A new stream starts the day the home did, the most common case. */
export const emptyIncomeStreamForm = (phase: { startDate: string }): IncomeStreamForm => ({
  label: '',
  amount: '',
  startDate: phase.startDate,
  endDate: '',
});

export function incomeStreamFormFrom(stream: IncomeStreamDto, currency: string): IncomeStreamForm {
  return {
    label: stream.label,
    amount: minorToInputString(stream.amountMinor, currency),
    startDate: stream.startDate,
    endDate: stream.endDate ?? '',
  };
}

export function validateIncomeStream(
  form: IncomeStreamForm,
  currency: string,
  phase: { startDate: string; endDate: string | null }
): IncomeStreamResult {
  const errors: IncomeStreamErrors = {};
  const amountMinor = parseMajorToMinor(form.amount, currency);
  const label = form.label.trim();

  if (label === '') errors.label = 'Name it, for example Salary.';
  else if (label.length > 60) errors.label = 'Keep the name under 60 characters.';
  if (amountMinor === null) errors.amount = 'Enter an amount such as 3200.';
  if (!calendarDateSchema.safeParse(form.startDate).success) errors.startDate = 'Pick the day it starts.';
  else if (form.startDate < phase.startDate || (phase.endDate !== null && form.startDate > phase.endDate)) errors.startDate = 'Pick a day while you lived here.';
  if (form.endDate !== '' && !calendarDateSchema.safeParse(form.endDate).success) errors.endDate = 'Enter a real date.';
  else if (form.endDate !== '' && form.startDate !== '' && form.endDate < form.startDate) errors.endDate = 'It cannot end before it starts.';
  if (Object.keys(errors).length > 0 || amountMinor === null) return { ok: false, errors };

  return { ok: true, stream: { label, amountMinor, startDate: form.startDate, endDate: form.endDate === '' ? null : form.endDate } };
}

/** "From Apr 1, 2026" or "Feb 1, 2026 – Feb 28, 2026". */
export function describeIncomeStream(stream: IncomeStreamDto, locale?: string): string {
  const start = formatCalendarDate(stream.startDate, locale);
  return stream.endDate === null ? `From ${start}` : `${start} – ${formatCalendarDate(stream.endDate, locale)}`;
}
