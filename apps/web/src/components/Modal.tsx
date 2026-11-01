import { X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './wizard/dialog.css';

interface ModalProps {
  /** What the dialog is for, announced when it opens. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A dialog in the middle of the screen: Escape or the backdrop closes it, and Tab stays inside it. */
export default function Modal({ label, onClose, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Something inside may have asked for focus already (autoFocus); otherwise start at the first control.
    if (!panel.current?.contains(document.activeElement)) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      document.body.style.overflow = scrollBefore;
      opener?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;

    const controls = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((control) => !control.closest('[inert]'));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panel} className="dialog" role="dialog" aria-modal="true" aria-label={label} onKeyDown={handleKeyDown}>
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
