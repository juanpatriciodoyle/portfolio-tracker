import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import Modal from '../Modal';
import MilestoneBar, { type WizardStepInfo } from './MilestoneBar';

interface WizardModalProps {
  /** Names the whole flow, e.g. "Add a living phase". */
  title: string;
  steps: readonly WizardStepInfo[];
  stepIndex: number;
  /** What this step asks, in a sentence. */
  heading: string;
  hint?: string;
  /** True on the step the person was brought back to from an earlier visit. */
  resumed?: boolean;
  error?: string | null;
  busy?: boolean;
  /** Hides the main button while the step holds a form with a main button of its own. */
  hideNext?: boolean;
  finishLabel: string;
  /** Room for two columns, such as a form beside a document preview. */
  wide?: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A guided flow in a centered dialog. It owns the frame (progress, heading, buttons, Enter to continue);
 * the caller owns the answers and decides when a step is complete.
 */
export default function WizardModal({
  title,
  steps,
  stepIndex,
  heading,
  hint,
  resumed = false,
  error,
  busy = false,
  hideNext = false,
  finishLabel,
  wide = false,
  onBack,
  onNext,
  onClose,
  children,
}: WizardModalProps) {
  const id = useId();
  const fields = useRef<HTMLDivElement>(null);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  // Each step opens with its first field ready to type in.
  useEffect(() => {
    fields.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
  }, [stepIndex]);

  // Enter in a text field moves on. Fields that use Enter themselves mark the event as handled,
  // and a form inside a step (such as adding a bill) submits itself.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || busy) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.closest('form') || ['checkbox', 'radio'].includes(target.type)) return;
    event.preventDefault();
    onNext();
  };

  return (
    <Modal label={title} onClose={onClose} wide={wide}>
      <div className="wizard">
        <header className="wizard__header">
          <p className="wizard__title">{title}</p>
          <MilestoneBar steps={steps} current={stepIndex} />
        </header>

        <div className="wizard__body" onKeyDown={handleKeyDown}>
          <div key={steps[stepIndex].id} className="wizard__step" role="group" aria-labelledby={`${id}-heading`}>
            <h2 className="wizard__heading" id={`${id}-heading`}>
              {heading}
            </h2>
            {hint && <p className="wizard__hint">{hint}</p>}
            {resumed && <p className="wizard__resumed">Picked up where you left off.</p>}
            <div className="wizard__fields" ref={fields}>
              {children}
            </div>
          </div>
        </div>

        {error && (
          <p className="form-error-text wizard__error" role="alert">
            {error}
          </p>
        )}

        <footer className="wizard__footer">
          <button type="button" className="btn-secondary-cancel" onClick={isFirst ? onClose : onBack} disabled={busy}>
            {isFirst ? 'Cancel' : 'Back'}
          </button>
          {!hideNext && (
            <button type="button" className="btn-primary-apply wizard__next" onClick={onNext} disabled={busy}>
              {busy ? 'Saving…' : isLast ? finishLabel : 'Continue'}
            </button>
          )}
        </footer>
      </div>
    </Modal>
  );
}
