import type { BillingCadence, CalendarDate } from '../../contracts/vocabulary';
import { daysInclusive } from '../calendarDate';
import { fold } from './text';

const BY_PERIOD_LENGTH: ReadonlyArray<readonly [number, number, BillingCadence]> = [
  [28, 31, 'MONTHLY'],
  [58, 62, 'BIMONTHLY'],
  [89, 92, 'QUARTERLY'],
  [365, 366, 'ANNUAL'],
];

const BY_WORD: ReadonlyArray<readonly [RegExp, BillingCadence]> = [
  [/\b(mensual|mensuales|monthly|mensuel|monatlich|mensile|mensalmente|mensal)\b/, 'MONTHLY'],
  [/\b(bimestral|bimestrales|bimonthly|bimensuel|cada dos meses|every two months|bimestrale)\b/, 'BIMONTHLY'],
  [/\b(trimestral|trimestrales|quarterly|trimestriel|vierteljahrlich|trimestrale)\b/, 'QUARTERLY'],
  [/\b(anual|anuales|annual|yearly|annuel|jahrlich|annuale|anualmente)\b/, 'ANNUAL'],
];

/**
 * How often the bill comes. The length of the period it covers is the reliable signal; a word in
 * the text ("cuota mensual") is used only when there is no period, and only when the words agree.
 */
export function inferCadence(input: {
  readonly periodStart: CalendarDate | null;
  readonly periodEnd: CalendarDate | null;
  readonly text: string;
}): BillingCadence | null {
  if (input.periodStart !== null && input.periodEnd !== null) {
    const days = daysInclusive(input.periodStart, input.periodEnd);
    return BY_PERIOD_LENGTH.find(([min, max]) => days >= min && days <= max)?.[2] ?? null;
  }

  const folded = fold(input.text);
  const named = new Set(BY_WORD.filter(([pattern]) => pattern.test(folded)).map(([, cadence]) => cadence));
  return named.size === 1 ? [...named][0] : null;
}
