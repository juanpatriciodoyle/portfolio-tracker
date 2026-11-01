interface SegmentedChoiceProps<T extends string> {
  /** The radio group's name; keep it unique on the page. */
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  /** Null while nothing is picked yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** The document did not say this and it is still empty: drawn with a warning border. */
  unread?: boolean;
}

/** A row of mutually exclusive choices, built on radio buttons. */
export default function SegmentedChoice<T extends string>({ name, legend, options, value, onChange, unread = false }: SegmentedChoiceProps<T>) {
  return (
    <fieldset className={`profile-segmented${unread ? ' is-unread' : ''}`}>
      <legend className="form-label">{legend}</legend>
      <div className="profile-segmented__rail">
        {options.map((option) => (
          <label key={option.value} className={`profile-segmented__option${option.value === value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="visually-hidden"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
