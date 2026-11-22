import type { MessageKey } from '../../i18n/catalogs';
import { useTranslation } from '../../i18n/useTranslation';
import type { IncomeView } from './phaseRatios';

const OPTIONS: readonly { value: IncomeView; label: MessageKey }[] = [
  { value: 'current', label: 'incomeView.current' },
  { value: 'average', label: 'incomeView.average' },
];

interface IncomeViewToggleProps {
  /** Keeps the radio group unique when several phase cards are on the page. */
  phaseId: string;
  value: IncomeView;
  onChange: (view: IncomeView) => void;
}

/** Switches a phase card between the income paying today and the average month of the whole stay. */
export default function IncomeViewToggle({ phaseId, value, onChange }: IncomeViewToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="income-view-toggle" role="radiogroup" aria-label={t('incomeView.label')}>
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
          {t(option.label)}
        </label>
      ))}
    </div>
  );
}
