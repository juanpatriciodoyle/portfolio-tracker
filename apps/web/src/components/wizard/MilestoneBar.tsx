import { Check } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

export interface WizardStepInfo {
  id: string;
  /** Short name shown under its milestone. */
  label: string;
}

interface MilestoneBarProps {
  steps: readonly WizardStepInfo[];
  /** Zero-based index of the step being filled in. */
  current: number;
}

/** How far along a guided flow is: a bar that fills as each milestone is reached. */
export default function MilestoneBar({ steps, current }: MilestoneBarProps) {
  const { t } = useTranslation();
  const lastIndex = Math.max(steps.length - 1, 1);
  const filled = Math.min(current, lastIndex) / lastIndex;

  return (
    <div
      className="milestones"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={current + 1}
      aria-valuetext={t('wizard.stepOf', { step: current + 1, total: steps.length, label: steps[current]?.label ?? '' })}
    >
      <div className="milestones__track" aria-hidden="true">
        <div className="milestones__fill" style={{ width: `${filled * 100}%` }} />
      </div>
      <ol className="milestones__list" aria-hidden="true">
        {steps.map((step, position) => (
          <li
            key={step.id}
            className={`milestone${position < current ? ' is-done' : ''}${position === current ? ' is-current' : ''}`}
          >
            <span className="milestone__dot">{position < current ? <Check size={12} strokeWidth={3} /> : position + 1}</span>
            <span className="milestone__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
