import type { FixedCostCategory } from '../../contracts';
import { CATEGORY_GROUPS, CATEGORY_LABELS } from './labels';

interface CategoryChipsProps {
  /** The radio group's name; keep it unique on the page. */
  name: string;
  value: FixedCostCategory | null;
  onChange: (category: FixedCostCategory) => void;
  legend?: string;
  /** Id of the element that explains an error, so screen readers announce it with the group. */
  errorId?: string;
  invalid?: boolean;
  /** The document did not say this and it is still empty: drawn with a warning border. */
  unread?: boolean;
  /** Offer only these categories; all of them when absent. */
  only?: readonly FixedCostCategory[];
}

/** Pick what a bill is for. Real radio buttons underneath, so arrow keys and screen readers just work. */
export default function CategoryChips({
  name,
  value,
  onChange,
  legend = 'What is it for?',
  errorId,
  invalid = false,
  unread = false,
  only,
}: CategoryChipsProps) {
  return (
    <fieldset className={`profile-chips${unread ? ' is-unread' : ''}`} aria-describedby={errorId}>
      <legend className="form-label">{legend}</legend>
      <div className="profile-chips__groups">
        {CATEGORY_GROUPS.map((group) => ({ ...group, categories: group.categories.filter((category) => !only || only.includes(category)) }))
          .filter((group) => group.categories.length > 0)
          .map((group) => (
          <div
            key={group.id}
            className="profile-chips__group"
            role={group.label ? 'group' : undefined}
            aria-label={group.label ?? undefined}
          >
            {group.label && (
              <span className="profile-chips__group-label" aria-hidden="true">
                {group.label}
              </span>
            )}
            {group.categories.map((category) => (
              <label
                key={category}
                className={`profile-chip${value === category ? ' is-selected' : ''}`}
                data-category={category}
              >
                <input
                  type="radio"
                  name={name}
                  value={category}
                  checked={value === category}
                  onChange={() => onChange(category)}
                  className="visually-hidden"
                  aria-invalid={invalid || undefined}
                />
                <span className="profile-chip__dot" aria-hidden="true" />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
