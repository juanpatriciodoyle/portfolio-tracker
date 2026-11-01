import { useId } from 'react';
import type { BenchmarksView } from './billingView';
import { describePhaseBenchmark, describeRefreshedAt, type Kpi } from './describeBenchmarks';

interface BenchmarksCardProps {
  phaseId: string;
  view: BenchmarksView;
}

/** One figure with the method behind it, shown inside the collapsed data sources. */
function Figure({ metric, kpi, verdict }: { metric: string; kpi: Kpi; verdict?: string }) {
  return (
    <li className="benchmarks__figure" data-metric={metric} data-verdict={verdict}>
      <strong className="benchmarks__figure-value">{kpi.value}</strong>
      {kpi.sub && <span className="benchmarks__figure-sub"> · {kpi.sub}</span>}
      <p className="phase-details__hint">{kpi.note}</p>
    </li>
  );
}

/** Where one living phase's income stands in the country and in the person's other nationalities; the figures behind it are in the data sources. */
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
        Where you stand
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
          <ul className="benchmarks__badges">
            {described.positioning.badge && (
              <li>
                <span className="benchmarks__badge benchmarks__badge--primary">{described.positioning.badge}</span>
              </li>
            )}
            {described.positioning.equivalences.map((equivalence) => (
              <li key={equivalence.countryCode} className="benchmarks__equivalence">
                <span>{equivalence.text}</span>
                {equivalence.tier && <span className="benchmarks__badge">{equivalence.tier}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {benchmarks && phase && !(noIncome && !described?.hasComparison) && (
        <details className="benchmarks__how">
          <summary>Data sources</summary>
          <ul className="benchmarks__figures">
            {described?.income && <Figure metric="income" kpi={described.income} />}
            {described?.housing && <Figure metric="housing" kpi={described.housing} verdict={described.housing.verdict} />}
            {described?.purchasingPower && <Figure metric="purchasing-power" kpi={described.purchasingPower} />}
          </ul>
          <ul className="phase-details__hint benchmarks__notes">
            {described?.gaps.map((gap) => <li key={gap}>{gap}</li>)}
            {described?.positioning.unavailable.map((note) => <li key={note}>{note}</li>)}
            <li>These are national averages, not figures for your city.</li>
            <li>
              Income is compared per person after adjusting for household size. We assume 1 adult and no children unless your
              profile says otherwise.
            </li>
            <li>Housing means rent, utilities and property taxes.</li>
            <li>
              Purchasing power in another country converts your income with international dollars (PPP), which use national price
              levels, not city prices, and change slowly.
            </li>
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
