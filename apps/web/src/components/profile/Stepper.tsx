import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A small plus/minus control for whole numbers with a short range. */
export default function Stepper({ id, label, value, min, max, onChange }: StepperProps) {
  return (
    <div className="form-group">
      <span className="form-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="profile-stepper" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          className="profile-icon-button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <output id={id} className="profile-stepper__value" aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className="profile-icon-button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
