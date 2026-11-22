import { translateEnglish, type Translate } from '../i18n/translate';

/** "1 year 2 months" for 14.2, "less than a month" for 0.3, "not started yet" for 0. Display only. */
export function formatMonths(months: number, t: Translate = translateEnglish): string {
  const whole = Math.round(months);
  if (whole < 1) return months > 0 ? t('duration.lessThanMonth') : t('duration.notStarted');
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const yearsText = years > 0 ? t('duration.years', { count: years }) : '';
  const monthsText = rest > 0 ? t('duration.months', { count: rest }) : '';
  return yearsText && monthsText ? t('duration.yearsAndMonths', { years: yearsText, months: monthsText }) : yearsText || monthsText;
}
