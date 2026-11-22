import { createContext } from 'react';
import type { Locale } from './locale';
import { translateEnglish, type Translate } from './translate';

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

/** Without a provider (tests, isolated components) everything reads in English. */
export const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => undefined, t: translateEnglish });
