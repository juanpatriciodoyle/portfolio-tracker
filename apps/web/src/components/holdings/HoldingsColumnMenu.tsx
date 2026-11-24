import { useEffect, useId, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import { COLUMN_KEYS, type ColumnChoice, type ColumnKey } from '../../lib/holdingsColumns';
import { COLUMN_LABEL } from './columns';

interface HoldingsColumnMenuProps {
  choice: ColumnChoice;
  onToggle: (key: ColumnKey) => void;
}

/** The "Customize columns" button and its list of columns to show. */
export function HoldingsColumnMenu({ choice, onToggle }: HoldingsColumnMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="dashboard-table-column-menu" ref={ref}>
      <button
        type="button"
        className="dashboard-icon-button"
        onClick={() => setOpen(!open)}
        aria-label={t('holdings.customizeColumns')}
        title={t('holdings.customizeColumns')}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        <Columns3 size={18} aria-hidden="true" />
      </button>

      {open && (
        <div id={id} className="dashboard-table-column-menu__menu" role="group" aria-label={t('holdings.customizeColumns')}>
          <ul>
            {COLUMN_KEYS.map((key) => (
              <li key={key} className="table-column-menu__item">
                <label className="table-column-menu__label">
                  <input type="checkbox" className="table-column-menu__checkbox" checked={choice[key]} onChange={() => onToggle(key)} />
                  {t(COLUMN_LABEL[key])}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default HoldingsColumnMenu;
