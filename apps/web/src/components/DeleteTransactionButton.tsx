import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { useSubmitOnce } from '../hooks/useSubmitOnce';
import { intlLocale } from '../i18n/locale';
import { useTranslation } from '../i18n/useTranslation';
import { authorizedFetch } from '../lib/authorizedFetch';
import { placePopover, placeVertically } from '../lib/popoverPlacement';
import { knownServerMessage, serverMessage } from '../lib/serverMessages';
import { deleteConsequence, describeRow, type EditableTransaction } from '../lib/transactionRows';

const WIDTH = 300;
const GAP = 8;
const MARGIN = 12;

interface DeleteTransactionButtonProps {
  tx: EditableTransaction;
  /** The transaction was removed. */
  onDeleted: () => void;
  /** The server no longer had it: the list is out of date. */
  onStale: () => void;
}

/**
 * The trash button of a history row. Pressing it asks once, in words, what is removed and what is recalculated; "Delete" is the
 * one way through, and it starts on "Cancel". The question floats above the page so a scrolling table can never cut it off.
 */
export default function DeleteTransactionButton({ tx, onDeleted, onStale }: DeleteTransactionButtonProps) {
  const { t, locale } = useTranslation();
  const intl = intlLocale(locale);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { run, pending } = useSubmitOnce();
  const titleId = useId();
  const bodyId = useId();
  const what = describeRow(tx, t, intl);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPlace(null);
    setError(null);
    if (returnFocus) trigger.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    setPlace(placePopover(trigger.current.getBoundingClientRect(), { width: WIDTH, viewportWidth: window.innerWidth, gap: GAP, margin: MARGIN }));
  }, [open]);

  // Once drawn its height is known (the refusal line makes it taller): it stays on the screen, below its button or above it.
  useLayoutEffect(() => {
    if (!open || !place || !panel.current || !trigger.current) return;
    const top = placeVertically(trigger.current.getBoundingClientRect(), { height: panel.current.offsetHeight, viewportHeight: window.innerHeight, gap: GAP, margin: MARGIN });
    if (top !== place.top) setPlace({ ...place, top });
  }, [open, place, error]);

  // The safe answer has the focus, so Enter or Space never deletes by accident.
  useEffect(() => {
    if (open && place) cancel.current?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) close(false);
    };
    const away = () => close(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open, close]);

  // Tab moves between the two answers and nowhere else while the question is open.
  const keepFocusInside = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panel.current) return;
    const buttons = panel.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirm = () =>
    void run(async () => {
      setError(null);
      try {
        const response = await authorizedFetch(`/api/transactions/${encodeURIComponent(tx.id)}`, { method: 'DELETE' });
        if (response.ok) {
          close(false);
          onDeleted();
          return;
        }
        if (response.status === 404) {
          close(false);
          onStale();
          return;
        }
        const data = await response.json().catch(() => ({}));
        setError(knownServerMessage(data, t, locale) ?? serverMessage(data, { t, locale }, 'history.changeFailed'));
      } catch {
        setError(t('history.changeNetwork'));
      }
    });

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tx-action tx-action--delete"
        aria-label={t('history.deleteRow', { action: what })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            className="confirm-popover"
            style={{ top: place?.top ?? 0, left: place?.left ?? 0, width: WIDTH, visibility: place ? 'visible' : 'hidden' }}
            onKeyDown={keepFocusInside}
          >
            <p id={titleId} className="confirm-popover__title">
              {t('history.deleteTitle')}
            </p>
            <p id={bodyId} className="confirm-popover__text">
              {deleteConsequence(tx, t, intl)}
            </p>
            {error && (
              <p role="alert" className="confirm-popover__error">
                {error}
              </p>
            )}
            <div className="confirm-popover__actions">
              <button ref={cancel} type="button" className="confirm-popover__button" onClick={() => close(true)}>
                {t('history.deleteCancel')}
              </button>
              <button type="button" className="confirm-popover__button confirm-popover__button--danger" disabled={pending} aria-busy={pending} onClick={confirm}>
                {pending ? t('history.deleting') : t('history.deleteConfirm')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
