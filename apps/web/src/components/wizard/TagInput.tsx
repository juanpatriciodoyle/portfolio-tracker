import { X } from 'lucide-react';
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { splitEntries } from '../../lib/countrySearch';

export interface Tag {
  id: string;
  label: string;
}

/** What typed text turns into: a tag, or a reason it did not. */
export type TagResolution = { ok: true; tag: Tag } | { ok: false; message: string };

interface TagInputProps {
  id: string;
  tags: readonly Tag[];
  onChange: (tags: Tag[]) => void;
  /** Understands one typed entry. Pure: it does not know which tags are already chosen. */
  resolve: (text: string) => TagResolution;
  max: number;
  placeholder: string;
  /** Names the list of chosen tags for screen readers. */
  listLabel: string;
  removeLabel: (tag: Tag) => string;
  invalid?: boolean;
  describedBy?: string;
}

/** Type a word and press Enter or comma: it becomes a pill. Pasting "Spain, Italy" makes two. */
export default function TagInput({
  id,
  tags,
  onChange,
  resolve,
  max,
  placeholder,
  listLabel,
  removeLabel,
  invalid = false,
  describedBy,
}: TagInputProps) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const full = tags.length >= max;

  /** Turns every entry in the text into a tag; stops at the first one that cannot be, and keeps it for fixing. */
  const commit = (typed: string) => {
    const entries = splitEntries(typed);
    const next = [...tags];
    let rest = entries;
    let message: string | null = null;

    for (const [position, entry] of entries.entries()) {
      const resolution = resolve(entry);
      if (!resolution.ok) {
        message = resolution.message;
        rest = entries.slice(position);
        break;
      }
      if (next.some((tag) => tag.id === resolution.tag.id)) {
        rest = entries.slice(position + 1);
        continue;
      }
      if (next.length >= max) {
        message = `Up to ${max} are allowed.`;
        rest = entries.slice(position);
        break;
      }
      next.push(resolution.tag);
      rest = entries.slice(position + 1);
    }

    if (next.length !== tags.length) onChange(next);
    setText(rest.join(', '));
    setProblem(message);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setProblem(null);
    if (/[,;\n]/.test(value)) commit(value);
    else setText(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && text.trim() !== '') {
      event.preventDefault();
      commit(text);
    } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const errorId = `${id}-problem`;

  return (
    <div className="tag-input">
      {tags.length > 0 && (
        <ul className="profile-tags tag-input__tags" aria-label={listLabel}>
          {tags.map((tag) => (
            <li key={tag.id} className="profile-tag tag-input__tag">
              {tag.label}
              <button
                type="button"
                className="profile-tag__remove"
                aria-label={removeLabel(tag)}
                onClick={() => onChange(tags.filter((chosen) => chosen.id !== tag.id))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="form-input"
        autoComplete="off"
        value={text}
        placeholder={full ? `Up to ${max}` : placeholder}
        disabled={full}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => text.trim() !== '' && commit(text)}
        aria-invalid={invalid || problem !== null || undefined}
        aria-describedby={problem ? errorId : describedBy}
      />
      {problem && (
        <p className="form-error-text" id={errorId} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
