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
  const index = useMemo(() => buildCountryIndex(), []);

  const resolve = (text: string): TagResolution => {
    const resolution = resolveCountry(index, text);
    if (resolution.kind === 'match') return { ok: true, tag: tagFor(resolution.code) };
    if (resolution.kind === 'ambiguous') {
      const names = resolution.codes.slice(0, 3).map((code) => countryName(code));
      return { ok: false, message: `Did you mean ${names.join(', ')}? Type a little more.` };
    }
    return { ok: false, message: `We do not know a country called "${text}".` };
  };

  return (
    <TagInput
      id={id}
      tags={value.map(tagFor)}
      onChange={(tags) => onChange(tags.map((tag) => tag.id))}
      resolve={resolve}
      max={MAX_NATIONALITIES}
      placeholder="Type a country, then Enter or comma"
      listLabel="Chosen nationalities"
      removeLabel={(tag) => `Remove ${countryName(tag.id)}`}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
