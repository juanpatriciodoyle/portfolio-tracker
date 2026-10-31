import { X } from 'lucide-react';
import type { ComparisonState } from '../../hooks/usePhaseComparison';
import { describeComparison } from './describeComparison';

interface PhaseComparisonProps {
  /** The earlier phase; the sentence reads "later home versus this one". */
  fromName: string;
  toName: string;
  state: ComparisonState;
  onClose: () => void;
}

/** Two homes side by side, in words first and numbers second. No charts. */
export default function PhaseComparison({ fromName, toName, state, onClose }: PhaseComparisonProps) {
  if (state.status === 'idle') return null;
  const description = state.status === 'ready' ? describeComparison({ fromName, toName, comparison: state.comparison }) : null;

  return (
    <section
      className="profile-card phase-comparison"
      aria-label={`Comparison of ${fromName} and ${toName}`}
      aria-live="polite"
      aria-busy={state.status === 'loading'}
    >
      <header className="phase-comparison__header">
        <h2 className="profile-section__title">
          {fromName} <span aria-hidden="true">→</span>
          <span className="visually-hidden"> compared with </span> {toName}
        </h2>
        <button type="button" className="profile-icon-button" aria-label="Close comparison" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {state.status === 'loading' && <p className="phase-comparison__hint">Comparing…</p>}
      {state.status === 'error' && (
        <p className="form-error-text" role="alert">
          {state.message}
        </p>
      )}
      {description?.kind === 'not-comparable' && <p className="phase-comparison__note">{description.headline}</p>}
      {description?.kind === 'comparable' && (
        <>
          <p className="phase-comparison__headline">{description.headline}</p>
          {description.leftOverLine && <p className="phase-comparison__detail">{description.leftOverLine}</p>}
          {description.conversionNote && (
            <p className="phase-comparison__note phase-comparison__conversion">
              {description.conversionNote}
              <span className="rate-badges">
                {description.rates.map((rate) => (
                  <span key={rate.currency} className="rate-badge">
                    {rate.currency} · {rate.label}
                  </span>
                ))}
              </span>
            </p>
          )}
          {description.categories.length > 0 && (
            <ul className="phase-comparison__list">
              {description.categories.map((line) => (
                <li key={line.category} className={`phase-comparison__item phase-comparison__item--${line.direction}`} data-category={line.category}>
                  <span className="category-dot" aria-hidden="true" />
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
