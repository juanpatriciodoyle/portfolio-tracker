import type { IncomeView } from './phaseRatios';

const OPTIONS: readonly { value: IncomeView; label: string }[] = [
  { value: 'current', label: 'Current rate' },
  { value: 'average', label: 'Phase average' },
];

interface IncomeViewToggleProps {
  /** Keeps the radio group unique when several phase cards are on the page. */
  phaseId: string;
  value: IncomeView;
  onChange: (view: IncomeView) => void;
}

/** Switches a phase card between the income paying today and the average month of the whole stay. */
export default function IncomeViewToggle({ phaseId, value, onChange }: IncomeViewToggleProps) {
  return (
    <div className="income-view-toggle" role="radiogroup" aria-label="Income shown">
      {OPTIONS.map((option) => (
        <label key={option.value} className={`income-view-toggle__option${option.value === value ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name={`income-view-${phaseId}`}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="visually-hidden"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
