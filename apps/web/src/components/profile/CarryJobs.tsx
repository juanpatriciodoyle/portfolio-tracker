import { useTranslation } from '../../i18n/useTranslation';
import { useId } from 'react';
import { keepDecimal } from '../../lib/inputFilters';
import { formatMinor } from '../../lib/money';
import type { CarryCandidate, CarryChoice } from './carryOver';

interface CarryJobsProps {
  candidates: readonly CarryCandidate[];
  choice: CarryChoice;
  /** The new home's currency. */
  currency: string;
  onChange: (choice: CarryChoice) => void;
}

/** "Keep these jobs?": the jobs of the previous home that carry on, all ticked until the person says otherwise. */
export default function CarryJobs({ candidates, choice, currency, onChange }: CarryJobsProps) {
  const { t } = useTranslation();
  const id = useId();
  if (candidates.length === 0) return null;

  const toggle = (key: string) =>
    onChange({ ...choice, unticked: choice.unticked.includes(key) ? choice.unticked.filter((other) => other !== key) : [...choice.unticked, key] });

  return (
    <fieldset className="carry-jobs">
      <legend className="form-label">{t('carry.title')}</legend>
      {candidates.map(({ key, stream, sameCurrency }) => {
        const kept = !choice.unticked.includes(key);
        return (
          <div key={key} className="carry-jobs__item">
            <label>
              <input type="checkbox" checked={kept} onChange={() => toggle(key)} /> {stream.label}
              {sameCurrency ? ` · ${t('carry.perMonth', { amount: formatMinor(stream.amountMinor, currency) })}` : ''}
            </label>
            {kept && !sameCurrency && (
              <input
                className="form-input carry-jobs__amount"
                inputMode="decimal"
                autoComplete="off"
                aria-label={t('carry.amountLabel', { label: stream.label, currency })}
                placeholder={t('carry.placeholder', { currency })}
                value={choice.amounts[key] ?? ''}
                onChange={(event) => onChange({ ...choice, amounts: { ...choice.amounts, [key]: keepDecimal(event.target.value) } })}
                id={`${id}-${key}`}
              />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
