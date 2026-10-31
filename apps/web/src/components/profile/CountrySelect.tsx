import { useMemo } from 'react';
import { countryOptions, flagEmoji } from '../../lib/countries';

interface CountrySelectProps {
  id: string;
  /** The chosen ISO code, or '' for nothing chosen. */
  value: string;
  onChange: (code: string) => void;
  /** Text of the empty option, e.g. "Choose a country". */
  placeholder: string;
  /** Codes to leave out, such as nationalities already added. */
  exclude?: readonly string[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export default function CountrySelect({
  id,
  value,
  onChange,
  placeholder,
  exclude = [],
  disabled = false,
  invalid = false,
  describedBy,
}: CountrySelectProps) {
  const options = useMemo(() => countryOptions(), []);

  return (
    <select
      id={id}
      className="form-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      <option value="">{placeholder}</option>
      {options
        .filter((option) => !exclude.includes(option.code))
        .map((option) => (
          <option key={option.code} value={option.code}>
            {flagEmoji(option.code)} {option.name}
          </option>
        ))}
    </select>
  );
}
