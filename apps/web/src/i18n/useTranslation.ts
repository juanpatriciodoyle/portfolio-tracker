import { useContext } from 'react';
import { LocaleContext } from './localeContext';

/** The words and the language of the screen: `t('key', { name })` and the current `locale`. */
export function useTranslation() {
  return useContext(LocaleContext);
}
