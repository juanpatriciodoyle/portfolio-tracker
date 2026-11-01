import { useId } from 'react';
import type { TrendsResponse } from '../../contracts';
import type { LoadStatus } from '../../lib/apiErrors';
import { groupTrendsByCurrency, hasAnyBills, type CurrencyTrend, type WindowFigure } from './describeTrends';

interface TrendsCardProps {
  status: LoadStatus;
  trends: TrendsResponse | null;
  message: string | null;
  onRetry: () => void;
  /** Opens the phase where a bill is logged (the one you live in now, or the latest). Absent: no button. */
  onOpenPhase?: () => void;
  openPhaseName?: string;
}

function FigureCells({ figures }: { figures: readonly WindowFigure[] }) {
  return (
    <>
      {figures.map((figure) => (
        <td key={figure.windowMonths} className="trends-table__cell">
          <span className="trends-table__amount">{figure.amount}</span>
          {figure.hint && <span className="trends-table__hint">{figure.hint}</span>}
        </td>
      ))}
    </>
  );
}

function CurrencyBlock({ block, showCurrency }: { block: CurrencyTrend; showCurrency: boolean }) {
  const headers = block.fixedCosts;
  const rows = [
    { label: 'Fixed costs', figures: block.fixedCosts },
    { label: 'Subscriptions', figures: block.subscriptions },
  ];

  return (
    <div className="trends-block" data-currency={block.currency}>
      {showCurrency && <h3 className="trends-block__currency">{block.currency}</h3>}
      <table className="trends-table">
        <caption className="visually-hidden">Average cost per month{showCurrency ? ` in ${block.currency}` : ''}</caption>
        <colgroup>
          <col className="trends-table__col-label" />
          {headers.map((figure) => (
            <col key={figure.windowMonths} className="trends-table__col-window" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="trends-table__corner">
              <span className="visually-hidden">Kind of cost</span>
            </th>
            {headers.map((figure) => (
              <th key={figure.windowMonths} scope="col" className="trends-table__window">
                {figure.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="trends-table__row-label">
                {row.label}
              </th>
              <FigureCells figures={row.figures} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How your real bills are trending: three averages side by side, no charts. */
export default function TrendsCard({ status, trends, message, onRetry, onOpenPhase, openPhaseName }: TrendsCardProps) {
  const id = useId();
  const blocks = trends ? groupTrendsByCurrency(trends) : [];

  return (
    <section className="profile-card trends-card" aria-labelledby={`${id}-title`} aria-busy={status === 'loading'}>
      <div className="trends-card__header">
        <h2 className="profile-section__title" id={`${id}-title`}>
          Trends
        </h2>
        <p className="profile-section__hint">Average cost per month, from the bills you logged</p>
      </div>

      {status === 'loading' && !trends && (
        <p className="phase-details__hint" role="status">
          Loading trends…
        </p>
      )}

      {status !== 'loading' && status !== 'ready' && (
        <div className="trends-card__problem">
          <p className="form-error-text" role="alert">
            {message ?? 'Trends could not be loaded.'}
          </p>
          <button type="button" className="btn-secondary-cancel" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {trends && !hasAnyBills(trends) && (
        <div className="trends-card__empty">
          <p className="phase-details__hint">
            No bills yet. Open a living phase and choose <strong>Add an expense</strong> to see how your monthly costs are trending.
          </p>
          {onOpenPhase && openPhaseName && (
            <button type="button" className="profile-text-button" onClick={onOpenPhase}>
              Open {openPhaseName}
            </button>
          )}
        </div>
      )}

      {trends && hasAnyBills(trends) && (
        <>
          {blocks.map((block) => (
            <CurrencyBlock key={block.currency} block={block} showCurrency={blocks.length > 1} />
          ))}
          <details className="trends-card__how">
            <summary>How these are counted</summary>
            <p className="phase-details__hint">
              Only complete months count (up to {trends.lastCompleteMonth}). A bill that covers several months is spread across
              them, one-off bills are left out, and amounts in different currencies are never added together.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
