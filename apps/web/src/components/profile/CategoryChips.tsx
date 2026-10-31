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
}

/** Pick what a bill is for. Real radio buttons underneath, so arrow keys and screen readers just work. */
export default function CategoryChips({
  name,
  value,
  onChange,
  legend = 'What is it for?',
  errorId,
  invalid = false,
}: CategoryChipsProps) {
  return (
    <fieldset className="profile-chips" aria-describedby={errorId}>
      <legend className="form-label">{legend}</legend>
      <div className="profile-chips__groups">
        {CATEGORY_GROUPS.map((group) => (
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
