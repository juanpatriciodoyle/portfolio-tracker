import { translateEnglish, type Translate } from '../i18n/translate';

/** The greeting for an hour of the day (0 to 23). The caller reads the clock. */
export function greetingFor(hour: number, t: Translate = translateEnglish): string {
  if (hour >= 5 && hour < 12) return t('greeting.morning');
  if (hour >= 12 && hour < 18) return t('greeting.afternoon');
  return t('greeting.evening');
}
