import { useId } from 'react';
import type { BenchmarksView } from './billingView';
import { describePhaseBenchmark, describeRefreshedAt } from './describeBenchmarks';

interface BenchmarksCardProps {
  phaseId: string;
  view: BenchmarksView;
}

/** How one living phase compares with its country: income, housing burden and what the income buys. */
export default function BenchmarksCard({ phaseId, view }: BenchmarksCardProps) {
  const id = useId();
  const { status, benchmarks, message, onRetry, nameOf } = view;
  const phase = benchmarks?.phases.find((candidate) => candidate.phaseId === phaseId);
  const described = phase ? describePhaseBenchmark(phase, nameOf) : null;
  const refreshed = describeRefreshedAt(benchmarks?.refreshedAt ?? null);
  const noIncome = phase?.gaps.includes('NO_INCOME') ?? false;

  return (
    <section className="benchmarks" aria-labelledby={`${id}-title`} aria-busy={status === 'loading'}>
      <h4 className="phase-details__heading" id={`${id}-title`}>
        How you compare
      </h4>

      {status === 'loading' && !benchmarks && (
        <div className="benchmarks__skeleton" role="status">
          <span className="visually-hidden">Loading comparisons…</span>
          <span className="benchmarks__skeleton-bar" aria-hidden="true" />
          <span className="benchmarks__skeleton-bar" aria-hidden="true" />
        </div>
      )}

      {status !== 'loading' && status !== 'ready' && (
        <div className="benchmarks__problem">
          <p className="form-error-text" role="alert">
            {message ?? 'The comparisons could not be loaded.'}
          </p>
          <button type="button" className="btn-secondary-cancel" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {benchmarks && !phase && <p className="phase-details__hint">No comparison is available for this living phase yet.</p>}

      {described && noIncome && !described.hasComparison && (
        <p className="phase-details__hint">{described.gaps[0]}</p>
      )}

      {described && !(noIncome && !described.hasComparison) && (
        <>
          <ul className="benchmarks__rows">
            {described.income && (
              <li className="benchmarks__row" data-metric="income">
                <p className="benchmarks__headline">{described.income.headline}</p>
                <p className="benchmarks__caption">{described.income.caption}</p>
              </li>
            )}
            {described.housing && (
              <li className="benchmarks__row" data-metric="housing" data-verdict={described.housing.verdict}>
                <p className="benchmarks__headline">{described.housing.headline}</p>
                <div className="benchmarks__bars" role="img" aria-label={`You ${described.housing.you.label}, typical ${described.housing.typical.label}`}>
                  <span className="benchmarks__bar-label">You</span>
                  <span className="benchmarks__bar-track">
                    <span className="benchmarks__bar benchmarks__bar--you" style={{ width: `${described.housing.you.widthPercent}%` }} />
                  </span>
                  <span className="benchmarks__bar-label">Typical</span>
                  <span className="benchmarks__bar-track">
                    <span className="benchmarks__bar benchmarks__bar--typical" style={{ width: `${described.housing.typical.widthPercent}%` }} />
                  </span>
                </div>
                <p className="benchmarks__detail">{described.housing.detail}</p>
                <p className="benchmarks__caption">{described.housing.caption}</p>
              </li>
            )}
            {described.purchasingPower && (
              <li className="benchmarks__row" data-metric="purchasing-power">
                <p className="benchmarks__headline">{described.purchasingPower.headline}</p>
                {described.purchasingPower.comparisons.map((line) => (
                  <p className="benchmarks__detail" key={line}>
                    {line}
                  </p>
                ))}
                <p className="benchmarks__caption">
                  {described.purchasingPower.unitNote} {described.purchasingPower.caption}
                </p>
              </li>
            )}
          </ul>

          {described.gaps.length > 0 && (
            <ul className="benchmarks__gaps">
              {described.gaps.map((gap) => (
                <li key={gap} className="phase-details__hint">
                  {gap}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {benchmarks && (
        <details className="benchmarks__how">
          <summary>How this is worked out</summary>
          <ul className="phase-details__hint benchmarks__notes">
            <li>These are national averages, not figures for your city.</li>
            <li>
              Income is compared per person after adjusting for household size. We assume 1 adult and no children unless your
              profile says otherwise.
            </li>
            <li>Housing means rent, utilities and property taxes.</li>
            <li>International dollars (PPP) use national price levels and change slowly.</li>
            <li>Argentine figures are in current pesos of the quarter published, so they can be out of date.</li>
            <li>
              Data is refreshed monthly from Eurostat, INDEC and the World Bank
              {refreshed ? `. Last refreshed ${refreshed}.` : '.'}
            </li>
          </ul>
        </details>
      )}
    </section>
  );
}
