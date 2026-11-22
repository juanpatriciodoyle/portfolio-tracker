import { intlLocale } from '../../i18n/locale';
import { useTranslation } from '../../i18n/useTranslation';
import { X } from 'lucide-react';
import type { TimelineEntryDto } from '../../contracts';
import { buildComparisonTable, SIGNIFICANT_DIFFERENCE } from './comparisonTable';
import { formatPercent } from '../../lib/money';

interface PhaseComparisonTableProps {
  entries: readonly TimelineEntryDto[];
  onClose: () => void;
}

/** Two to four homes as columns. Only what differs by more than a few percent is listed. */
export default function PhaseComparisonTable({ entries, onClose }: PhaseComparisonTableProps) {
  const { t, locale } = useTranslation();
  const table = buildComparisonTable(entries, intlLocale(locale), t);
  const threshold = formatPercent(SIGNIFICANT_DIFFERENCE);

  return (
    <section className="profile-card phase-comparison" aria-label={t('compare.tableLabel')}>
      <header className="phase-comparison__header">
        <h2 className="profile-section__title">{t('compare.tableTitle', { count: entries.length })}</h2>
        <button type="button" className="profile-icon-button" aria-label={t('compare.close')} onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {table.kind === 'mixed-currencies' && (
        <p className="phase-comparison__note">
          {t('compare.mixed', { currencies: table.currencies.join(', ') })}
        </p>
      )}

      {table.kind === 'table' && (
        <>
          {table.rows.length > 0 ? (
            <table className="compare-table" style={{ ['--compare-columns' as string]: table.columns.length }}>
              <caption className="visually-hidden">{t('compare.caption', { currency: table.currency, threshold })}</caption>
              <thead>
                <tr>
                  <td />
                  {table.columns.map((column) => (
                    <th key={column.phaseId} scope="col">
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.key} data-row={row.key}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((cell, index) => (
                      <td key={table.columns[index].phaseId}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="phase-comparison__note">{t('compare.within', { threshold })}</p>
          )}
          {table.hiddenRows > 0 && table.rows.length > 0 && (
            <p className="phase-comparison__hint">
              {t('compare.hidden', { count: table.hiddenRows, threshold })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
