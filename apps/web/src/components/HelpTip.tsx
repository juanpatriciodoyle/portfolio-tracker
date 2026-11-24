import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { placePopover } from '../lib/popoverPlacement';

interface HelpTipProps {
  /** The word being explained: it names the button for assistive technology. */
  term: string;
  /** One plain sentence. */
  text: string;
}

/** After the pointer leaves, the explanation waits this long, so the pointer can cross the gap onto it. */
const CLOSE_DELAY_MS = 200;
const POPOVER_WIDTH = 280;
const GAP = 8;
const MARGIN = 12;

/**
 * A "?" that explains one word. It opens when the pointer rests on it or the keyboard reaches it; a click or a tap
 * keeps it open (a second one lets it go), and Esc or a click elsewhere closes it. The explanation floats above the page
 * so a table's scrolling area can never cut it off.
 */
export function HelpTip({ term, text }: HelpTipProps) {
  const { t } = useTranslation();
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovering || focused || pinned;
  const closeTimer = useRef<number | undefined>(undefined);
  /** A mouse press focuses the button too: only a focus that did not come from one counts as the keyboard arriving. */
  const pressed = useRef(false);
  /** Esc hands focus back to the "?": that focus must not open it again. */
  const returning = useRef(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const popover = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const dismiss = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setHovering(false);
    setFocused(false);
    setPinned(false);
  }, []);
  const enter = () => {
    window.clearTimeout(closeTimer.current);
    setHovering(true);
  };
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovering(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    setPlace(placePopover(button.current.getBoundingClientRect(), { width: POPOVER_WIDTH, viewportWidth: window.innerWidth, gap: GAP, margin: MARGIN }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = dismiss;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dismiss();
      if (button.current && document.activeElement !== button.current) {
        returning.current = true;
        button.current.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !popover.current?.contains(target)) dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, dismiss]);

  return (
    <span className="help-tip">
      <button
        ref={button}
        type="button"
        className="help-tip__button"
        aria-label={t('holdings.help.about', { term })}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onMouseDown={() => {
          pressed.current = true;
        }}
        onFocus={() => {
          if (returning.current) {
            returning.current = false;
            return;
          }
          if (pressed.current) return;
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onClick={() => {
          pressed.current = false;
          setPinned((value) => !value);
        }}
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            id={id}
            role="dialog"
            aria-label={term}
            className="help-tip__popover"
            onMouseEnter={enter}
            onMouseLeave={leave}
            style={{ top: place?.top ?? 0, left: place?.left ?? 0, width: POPOVER_WIDTH, visibility: place ? 'visible' : 'hidden' }}
          >
            <p className="help-tip__text">{text}</p>
            <button type="button" className="help-tip__close" aria-label={t('holdings.help.close')} onClick={dismiss}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>,
          document.body
        )}
    </span>
  );
}

export default HelpTip;
