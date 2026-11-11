import { INCOME_END_REASONS, calendarDateSchema, type IncomeEndReason, type IncomeStreamDto } from '../../contracts';
import { formatCalendarDate, minorToInputString, parseMajorToMinor } from '../../lib/money';

export type IncomeKind = 'MONTHLY' | 'ONE_TIME';

/** The words for why a job ended, in the order they are offered. */
export const END_REASON_LABELS: Record<IncomeEndReason, string> = {
  LAID_OFF: 'Laid off',
  QUIT: 'Quit',
  CONTRACT_FINISHED: 'Contract finished',
  OTHER: 'Other',
};
export const END_REASON_OPTIONS = INCOME_END_REASONS.map((value) => ({ value, label: END_REASON_LABELS[value] }));

/** What the "income stream" form holds while it is being filled in. */
export interface IncomeStreamForm {
  /** Pays every month, or arrived once (a benefit, a bonus). */
  kind: IncomeKind;
  /** Why it ended, when it did. Empty when not said. */
  endReason: IncomeEndReason | '';
  /** The job or source: "Salary", "Freelance consulting". */
  label: string;
  /** Monthly net, in major units as typed. */
  amount: string;
  startDate: string;
  /** Empty means it is still paying. Not used for a one-time deposit, whose day is `startDate`. */
  endDate: string;
}

export type IncomeStreamErrors = Partial<Record<'label' | 'amount' | 'startDate' | 'endDate', string>>;
export type IncomeStreamResult = { ok: true; stream: IncomeStreamDto } | { ok: false; errors: IncomeStreamErrors };

/** A new stream starts the day the home did, the most common case. */
export const emptyIncomeStreamForm = (phase: { startDate: string }): IncomeStreamForm => ({
  kind: 'MONTHLY',
  endReason: '',
  label: '',
  amount: '',
  startDate: phase.startDate,
  endDate: '',
});

export function incomeStreamFormFrom(stream: IncomeStreamDto, currency: string): IncomeStreamForm {
  return {
    kind: stream.kind ?? 'MONTHLY',
    endReason: stream.endReason ?? '',
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
  const once = form.kind === 'ONE_TIME';
  if (!once) {
    if (form.endDate !== '' && !calendarDateSchema.safeParse(form.endDate).success) errors.endDate = 'Enter a real date.';
    else if (form.endDate !== '' && form.startDate !== '' && form.endDate < form.startDate) errors.endDate = 'It cannot end before it starts.';
  }
  if (Object.keys(errors).length > 0 || amountMinor === null) return { ok: false, errors };

  // Older streams carry neither field: a monthly job without a reason is saved exactly as it always was.
  if (once) return { ok: true, stream: { label, amountMinor, startDate: form.startDate, endDate: null, kind: 'ONE_TIME' } };
  const endDate = form.endDate === '' ? null : form.endDate;
  return {
    ok: true,
    stream: { label, amountMinor, startDate: form.startDate, endDate, ...(endDate !== null && form.endReason !== '' ? { endReason: form.endReason } : {}) },
  };
}

/** "Paid Mar 10, 2026", "From Apr 1, 2026" or "Feb 1, 2026 – Feb 28, 2026". */
export function describeIncomeStream(stream: IncomeStreamDto, locale?: string): string {
  if (stream.kind === 'ONE_TIME') return `Paid ${formatCalendarDate(stream.startDate, locale)}`;
  const start = formatCalendarDate(stream.startDate, locale);
  return stream.endDate === null ? `From ${start}` : `${start} – ${formatCalendarDate(stream.endDate, locale)}`;
}

/** "Laid off · ended Mar 31, 2026", or "Ended Mar 31, 2026" when no reason was given; null for a job that has not ended. */
export function describeIncomeEnd(stream: IncomeStreamDto, locale?: string): string | null {
  if (stream.kind === 'ONE_TIME' || stream.endDate === null) return null;
  const ended = formatCalendarDate(stream.endDate, locale);
  return stream.endReason ? `${END_REASON_LABELS[stream.endReason]} · ended ${ended}` : `Ended ${ended}`;
}

export type EndJobResult = { ok: true; stream: IncomeStreamDto } | { ok: false; error: string };

/** Ends a job on its last day, with the reason when it is known. The job's pay up to that day stays in the books. */
export function endJob(stream: IncomeStreamDto, lastDay: string, reason: IncomeEndReason | '', phase: { endDate: string | null }): EndJobResult {
  if (!calendarDateSchema.safeParse(lastDay).success) return { ok: false, error: 'Pick the last day you were paid.' };
  if (lastDay < stream.startDate) return { ok: false, error: 'It cannot end before it started.' };
  if (phase.endDate !== null && lastDay > phase.endDate) return { ok: false, error: 'Pick a day while you lived here.' };
  const { endReason: _previous, ...rest } = stream;
  return { ok: true, stream: { ...rest, endDate: lastDay, ...(reason !== '' ? { endReason: reason } : {}) } };
}

/** Brings an ended job back: it pays again, with no end and no reason. */
export function reopenJob(stream: IncomeStreamDto): IncomeStreamDto {
  const { endReason: _reason, ...rest } = stream;
  return { ...rest, endDate: null };
}

export interface IncomeRow {
  stream: IncomeStreamDto;
  /** Where the stream sits in the list the rows were made from, so a change can find it again. */
  index: number;
}

export interface IncomeGroups {
  paying: IncomeRow[];
  ended: IncomeRow[];
  oneTime: IncomeRow[];
}

/**
 * Splits income for the list: jobs still paying (or about to), jobs that ended before `today`, and one-time
 * deposits. With no `today` a job counts as ended only when it has an end date. Dates compare as text.
 */
export function groupIncome(streams: readonly IncomeStreamDto[], today: string | undefined): IncomeGroups {
  const groups: IncomeGroups = { paying: [], ended: [], oneTime: [] };
  streams.forEach((stream, index) => {
    const row = { stream, index };
    if (stream.kind === 'ONE_TIME') groups.oneTime.push(row);
    else if (stream.endDate !== null && (today === undefined || stream.endDate < today)) groups.ended.push(row);
    else groups.paying.push(row);
  });
  return groups;
}
