import { intlLocale } from '../../i18n/locale';
import { useTranslation } from '../../i18n/useTranslation';
import { useMemo } from 'react';
import { buildCountryIndex, resolveCountry } from '../../lib/countrySearch';
import { countryName, flagEmoji } from '../../lib/countries';
import TagInput, { type Tag, type TagResolution } from '../wizard/TagInput';

export const MAX_NATIONALITIES = 5;

interface NationalitiesInputProps {
  id: string;
  /** ISO codes. */
  value: readonly string[];
  onChange: (codes: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}

const tagFor = (code: string): Tag => ({ id: code, label: `${flagEmoji(code)} ${countryName(code)}` });

/** Nationalities as pills: type "Spain" or "Argentina, Italy" and press Enter or comma. */
export default function NationalitiesInput({ id, value, onChange, invalid, describedBy }: NationalitiesInputProps) {
  const { t, locale } = useTranslation();
  const index = useMemo(() => buildCountryIndex([intlLocale(locale), 'en', 'es']), [locale]);

  const resolve = (text: string): TagResolution => {
    const resolution = resolveCountry(index, text);
    if (resolution.kind === 'match') return { ok: true, tag: tagFor(resolution.code) };
    if (resolution.kind === 'ambiguous') {
      const names = resolution.codes.slice(0, 3).map((code) => countryName(code));
      return { ok: false, message: t('nationalities.didYouMean', { names: names.join(', ') }) };
    }
    return { ok: false, message: t('nationalities.unknown', { text }) };
  };

  return (
    <TagInput
      id={id}
      tags={value.map(tagFor)}
      onChange={(tags) => onChange(tags.map((tag) => tag.id))}
      resolve={resolve}
      max={MAX_NATIONALITIES}
      placeholder={t('nationalities.placeholder')}
      listLabel={t('nationalities.chosen')}
      removeLabel={(tag) => t('nationalities.remove', { country: countryName(tag.id) })}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
