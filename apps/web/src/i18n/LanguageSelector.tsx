import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_NAMES, isLocale } from './locale';
import { useTranslation } from './useTranslation';

/** Picks the language of the whole app. Each language is named in its own words, so anyone can find theirs. */
export default function LanguageSelector() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <label className="language-select" title={t('language.label')}>
      <Languages size={14} aria-hidden="true" />
      <select
        className="language-select__control"
        aria-label={t('language.label')}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLocale(event.target.value);
        }}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
