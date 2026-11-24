import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Languages } from 'lucide-react';
import { LOCALES, LOCALE_NAMES } from './locale';
import { useTranslation } from './useTranslation';

/**
 * Picks the language of the whole app. Only an icon is on screen: a press opens a small menu, each language named in
 * its own words so anyone can find theirs, the current one ticked. Choosing closes it; Escape, Tab or a click elsewhere
 * close it without a change, and focus goes back to the icon.
 */
export default function LanguageSelector() {
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // The menu opens on the language in use, so an arrow key moves from where the person already is.
    items.current[Math.max(0, LOCALES.indexOf(locale))]?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
    // Read once per opening: choosing a language closes the menu, so the locale cannot change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const move = (to: number) => items.current[(to + LOCALES.length) % LOCALES.length]?.focus();

  const onMenuKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    switch (event.key) {
      case 'Escape':
        // The menu closes first; a dialog around it is not closed by the same press.
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(LOCALES.length - 1);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <span className="language-menu" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="header-icon-button"
        aria-label={t('language.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t('language.label')}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <Languages size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={t('language.label')} className="language-menu__list">
          {LOCALES.map((option, index) => (
            <button
              key={option}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              tabIndex={-1}
              lang={option}
              className="language-menu__item"
              onKeyDown={(event) => onMenuKeyDown(event, index)}
              onClick={() => {
                setLocale(option);
                close();
              }}
            >
              <span>{LOCALE_NAMES[option]}</span>
              {option === locale && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
