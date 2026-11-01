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
  const table = buildComparisonTable(entries);
  const threshold = formatPercent(SIGNIFICANT_DIFFERENCE);

  return (
    <section className="profile-card phase-comparison" aria-label="Comparison of living phases">
      <header className="phase-comparison__header">
        <h2 className="profile-section__title">Comparing {entries.length} homes</h2>
        <button type="button" className="profile-icon-button" aria-label="Close comparison" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {table.kind === 'mixed-currencies' && (
        <p className="phase-comparison__note">
          These homes use different currencies ({table.currencies.join(', ')}). Compare two at a time to see them converted.
        </p>
      )}

      {table.kind === 'table' && (
        <>
          {table.rows.length > 0 ? (
            <table className="compare-table" style={{ ['--compare-columns' as string]: table.columns.length }}>
              <caption className="visually-hidden">Monthly figures in {table.currency}, only where homes differ by more than {threshold}</caption>
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
            <p className="phase-comparison__note">These homes are within {threshold} of each other on everything.</p>
          )}
          {table.hiddenRows > 0 && table.rows.length > 0 && (
            <p className="phase-comparison__hint">
              {table.hiddenRows} more {table.hiddenRows === 1 ? 'row differs' : 'rows differ'} by {threshold} or less.
            </p>
          )}
        </>
      )}
    </section>
  );
}
