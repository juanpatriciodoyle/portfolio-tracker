import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { setActiveLocale } from './activeLocale';
import { detectLocale, type Locale } from './locale';
import { LocaleContext } from './localeContext';
import { readStoredLocale, storeLocale } from './localeStore';
import { translatorFor } from './translate';

interface LocaleProviderProps {
  /** Starts in this language instead of the saved or detected one. */
  initial?: Locale;
  children: ReactNode;
}

/** Holds the chosen language: remembered between visits, announced in <html lang>, used by every formatter. */
export function LocaleProvider({ initial, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const first = initial ?? detectLocale(readStoredLocale(), typeof navigator === 'undefined' ? undefined : navigator.language);
    // Formatters read this while the first render is still happening.
    setActiveLocale(first);
    return first;
  });

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    storeLocale(next);
    setLocaleState(next);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: translatorFor(locale) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
