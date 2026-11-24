interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  /** What it turns on: it is also the switch's name for assistive technology. */
  label: string;
  /** A longer explanation shown on hover. */
  hint?: string;
}

/** An on/off setting that takes effect at once: the same switch as "Adjust for inflation", a real `role="switch"`. */
export default function Switch({ checked, onChange, label, hint }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={hint} className="switch" onClick={onChange}>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}
