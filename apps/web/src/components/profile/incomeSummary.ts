import { addDays, type IncomeStreamDto } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';

/**
 * One line for a home's card: what the jobs paying on `day` pay each month, or that nothing does and since when.
 * One job is named, several are counted. A one-time deposit is not a paycheck and never shows here.
 * Dates compare as text (YYYY-MM-DD).
 */
export function summarizeActiveIncome(
  streams: readonly IncomeStreamDto[],
  day: string,
  formatMonthly: (amountMinor: number) => string,
  formatDay: (day: string) => string = (value) => value,
  t: Translate = currentTranslator()
): string {
  const jobs = streams.filter((stream) => stream.kind !== 'ONE_TIME' && stream.amountMinor > 0);
  const paying = jobs.filter((stream) => stream.startDate <= day && (stream.endDate === null || stream.endDate >= day)).sort((a, b) => b.amountMinor - a.amountMinor);

  if (paying.length === 0) {
    const lastEnd = jobs.map((stream) => stream.endDate).filter((end): end is string => end !== null && end < day).sort().pop();
    return lastEnd === undefined ? t('incomeSummary.none') : t('incomeSummary.noneSince', { date: formatDay(addDays(lastEnd, 1)) });
  }

  const total = paying.reduce((sum, stream) => sum + stream.amountMinor, 0);
  return t('incomeSummary.line', { who: paying.length === 1 ? paying[0].label : t('incomeSummary.jobs', { count: paying.length }), amount: formatMonthly(total) });
}
