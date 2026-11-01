import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { buildCountryIndex, searchCountries } from '../../lib/countrySearch';
import { flagEmoji } from '../../lib/countries';

/** Room the list keeps from the screen edge, and the least it will shrink to before opening upward instead. */
const LIST_MARGIN = 8;
const LIST_MIN_HEIGHT = 160;

interface CountrySelectProps {
  id: string;
  /** The chosen ISO code, or '' for nothing chosen. */
  value: string;
  onChange: (code: string) => void;
  /** Shown while nothing is chosen, e.g. "Choose a country". */
  placeholder: string;
  /** Codes to leave out, such as nationalities already added. */
  exclude?: readonly string[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * A country picker you can type into. Click it and start typing: names in English and Spanish are
 * matched from their beginning first and from anywhere inside them after that, with or without accents.
 */
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
  const index = useMemo(() => buildCountryIndex(), []);
  /** What has been typed since the field was entered; null while it just shows the chosen country. */
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement | null>(null);

  /**
   * The list floats over the dialog instead of growing it, so a short step cannot cut it off. It sits under
   * the field, or above it when there is no room below.
   */
  const placeList = useCallback(() => {
    if (!list.current || !input.current) return;
    const field = input.current.getBoundingClientRect();
    const below = window.innerHeight - field.bottom - LIST_MARGIN;
    const above = field.top - LIST_MARGIN;
    const opensUp = below < LIST_MIN_HEIGHT && above > below;
    Object.assign(list.current.style, {
      left: `${field.left}px`,
      width: `${field.width}px`,
      top: opensUp ? 'auto' : `${field.bottom + 4}px`,
      bottom: opensUp ? `${window.innerHeight - field.top + 4}px` : 'auto',
      maxHeight: `${Math.max(Math.min(opensUp ? above : below, 280), LIST_MIN_HEIGHT)}px`,
    });
  }, []);

  const listRef = useCallback(
    (element: HTMLUListElement | null) => {
      list.current = element;
      placeList();
    },
    [placeList]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', placeList);
    window.addEventListener('scroll', placeList, true);
    return () => {
      window.removeEventListener('resize', placeList);
      window.removeEventListener('scroll', placeList, true);
    };
  }, [open, placeList]);

  const chosen = index.find((entry) => entry.code === value);
  const chosenLabel = chosen ? `${flagEmoji(chosen.code)} ${chosen.name}` : '';
  const results = searchCountries(
    index.filter((entry) => !exclude.includes(entry.code)),
    query ?? ''
  );
  const listboxId = `${id}-listbox`;
  const optionId = (code: string) => `${id}-option-${code}`;
  const activeCode = open ? results[active]?.code : undefined;

  useEffect(() => {
    if (activeCode) document.getElementById(optionId(activeCode))?.scrollIntoView?.({ block: 'nearest' });
    // optionId only closes over id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCode]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (code: string) => {
    onChange(code);
    close();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setOpen(true);
    setActive(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => Math.max(0, Math.min(current + step, results.length - 1)));
        return;
      }
      case 'Enter':
        if (open) {
          event.preventDefault();
          if (results[active]) choose(results[active].code);
        }
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        return;
      case 'Tab':
        // Tabbing away from something typed takes the best match, so the keyboard flow is not interrupted.
        if (open && query?.trim() && results[active]) onChange(results[active].code);
        return;
    }
  };

  const handleBlur = () => {
    // Emptying the field and leaving it clears the choice.
    if (query !== null && query.trim() === '' && value !== '') onChange('');
    close();
  };

  return (
    <div className="combobox">
      <input
        ref={input}
        id={id}
        className="form-input combobox__input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeCode ? optionId(activeCode) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={query ?? chosenLabel}
        onChange={handleChange}
        onFocus={(event) => event.target.select()}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <ChevronDown className="combobox__chevron" size={16} aria-hidden="true" />
      {open && (
        <ul ref={listRef} className="combobox__list" id={listboxId} role="listbox" aria-label="Countries" onMouseDown={(event) => event.preventDefault()}>
          {results.length === 0 && (
            <li className="combobox__empty" role="presentation">
              No country matches “{query}”.
            </li>
          )}
          {results.map((entry, position) => (
            <li
              key={entry.code}
              id={optionId(entry.code)}
              role="option"
              aria-selected={entry.code === value}
              className={`combobox__option${position === active ? ' is-active' : ''}${entry.code === value ? ' is-chosen' : ''}`}
              onMouseMove={() => setActive(position)}
              onClick={() => choose(entry.code)}
            >
              <span aria-hidden="true">{flagEmoji(entry.code)}</span> {entry.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
