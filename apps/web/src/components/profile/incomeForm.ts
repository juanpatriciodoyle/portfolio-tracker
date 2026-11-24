import { INCOME_END_REASONS, calendarDateSchema, lastPayDay, type IncomeEndReason, type IncomeStreamDto } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import type { MessageKey } from '../../i18n/catalogs';
import { formatCalendarDate, minorToInputString, parseMajorToMinor } from '../../lib/money';

export type IncomeKind = 'MONTHLY' | 'ONE_TIME';

/** The words for why a job ended, in the order they are offered. */
export const END_REASON_LABELS: Record<IncomeEndReason, MessageKey> = {
  LAID_OFF: 'income.reason.LAID_OFF',
  QUIT: 'income.reason.QUIT',
  CONTRACT_FINISHED: 'income.reason.CONTRACT_FINISHED',
  OTHER: 'income.reason.OTHER',
};
export const endReasonOptions = (t: Translate) => INCOME_END_REASONS.map((value) => ({ value, label: t(END_REASON_LABELS[value]) }));

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
  phase: { startDate: string; endDate: string | null },
  t: Translate = currentTranslator()
): IncomeStreamResult {
  const errors: IncomeStreamErrors = {};
  const amountMinor = parseMajorToMinor(form.amount, currency);
  const label = form.label.trim();

  if (label === '') errors.label = t('income.errName');
  else if (label.length > 60) errors.label = t('income.errNameLength');
  if (amountMinor === null) errors.amount = t('income.errAmount');
  if (!calendarDateSchema.safeParse(form.startDate).success) errors.startDate = t('income.errStart');
  else if (form.startDate < phase.startDate || (phase.endDate !== null && form.startDate > phase.endDate)) errors.startDate = t('income.errWhileHere');
  const once = form.kind === 'ONE_TIME';
  if (!once) {
    if (form.endDate !== '' && !calendarDateSchema.safeParse(form.endDate).success) errors.endDate = t('bill.errRealDate');
    else if (form.endDate !== '' && form.startDate !== '' && form.endDate < form.startDate) errors.endDate = t('expense.errEnd');
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
export function describeIncomeStream(stream: IncomeStreamDto, locale?: string, t: Translate = currentTranslator()): string {
  if (stream.kind === 'ONE_TIME') return t('income.paidOn', { date: formatCalendarDate(stream.startDate, locale) });
  const start = formatCalendarDate(stream.startDate, locale);
  return stream.endDate === null ? t('income.fromDate', { date: start }) : `${start} – ${formatCalendarDate(stream.endDate, locale)}`;
}

/**
 * "Laid off · ended Mar 31, 2026", or "Ended Mar 31, 2026" when no reason was given; "Until you moved out · Feb 28, 2026" for a job
 * that stopped only because the home did; null for a job that has not ended.
 */
export function describeIncomeEnd(stream: IncomeStreamDto, locale?: string, t: Translate = currentTranslator(), endsWithHome = false): string | null {
  if (stream.kind === 'ONE_TIME' || stream.endDate === null) return null;
  const ended = formatCalendarDate(stream.endDate, locale);
  if (endsWithHome) return t('income.untilMovedOut', { date: ended });
  return stream.endReason ? t('income.endedWithReason', { reason: t(END_REASON_LABELS[stream.endReason]), date: ended }) : t('details.ended', { date: ended });
}

/** The stream without the reason its job ended: a job that pays again, or is ended anew, has no old reason. */
export function withoutEndReason(stream: IncomeStreamDto): IncomeStreamDto {
  const copy: IncomeStreamDto = { ...stream };
  delete copy.endReason;
  return copy;
}

export type EndJobResult = { ok: true; stream: IncomeStreamDto } | { ok: false; error: string };

/** Ends a job on its last day, with the reason when it is known. The job's pay up to that day stays in the books. */
export function endJob(stream: IncomeStreamDto, lastDay: string, reason: IncomeEndReason | '', phase: { endDate: string | null }, t: Translate = currentTranslator()): EndJobResult {
  if (!calendarDateSchema.safeParse(lastDay).success) return { ok: false, error: t('income.errLastPaid') };
  if (lastDay < stream.startDate) return { ok: false, error: t('income.errBeforeStarted') };
  if (phase.endDate !== null && lastDay > phase.endDate) return { ok: false, error: t('income.errWhileHere') };
  return { ok: true, stream: { ...withoutEndReason(stream), endDate: lastDay, ...(reason !== '' ? { endReason: reason } : {}) } };
}

/** Brings an ended job back: it pays again, with no end and no reason. */
export function reopenJob(stream: IncomeStreamDto): IncomeStreamDto {
  return { ...withoutEndReason(stream), endDate: null };
}

export interface IncomeRow {
  stream: IncomeStreamDto;
  /** Where the stream sits in the list the rows were made from, so a change can find it again. */
  index: number;
  /** The last day it pays: its own end date, or the day the home ended; null while it goes on. */
  lastDay: string | null;
  /** True when it stopped only because the person left the home: no end date or reason was ever given. */
  endsWithHome: boolean;
}

export interface IncomeGroups {
  paying: IncomeRow[];
  ended: IncomeRow[];
  oneTime: IncomeRow[];
}

/**
 * Splits income for the list: jobs still paying (or about to), jobs that ended before `today`, and one-time
 * deposits. A job does not outlive its home: in a home the person has left, a job with no end date ended the day the home
 * did (the rule lives in `lastPayDay`). With no `today` a job counts as ended only when it has an end date. Dates compare as text.
 */
export function groupIncome(streams: readonly IncomeStreamDto[], today: string | undefined, home?: { startDate: string; endDate: string | null }): IncomeGroups {
  const groups: IncomeGroups = { paying: [], ended: [], oneTime: [] };
  streams.forEach((stream, index) => {
    const lastDay = today !== undefined && home ? lastPayDay(stream, home, today) : stream.endDate;
    const row: IncomeRow = { stream, index, lastDay, endsWithHome: stream.endDate === null && lastDay !== null };
    if (stream.kind === 'ONE_TIME') groups.oneTime.push({ ...row, lastDay: null, endsWithHome: false });
    else if (lastDay !== null && (today === undefined || lastDay < today)) groups.ended.push(row);
    else groups.paying.push(row);
  });
  return groups;
}
