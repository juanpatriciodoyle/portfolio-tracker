import { intlLocale } from '../../i18n/locale';
import { useTranslation } from '../../i18n/useTranslation';
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
  const { t, locale } = useTranslation();
  const id = useId();
  const { status, benchmarks, message, onRetry, nameOf } = view;
  const phase = benchmarks?.phases.find((candidate) => candidate.phaseId === phaseId);
  const described = phase ? describePhaseBenchmark(phase, nameOf, intlLocale(locale), t) : null;
  const refreshed = describeRefreshedAt(benchmarks?.refreshedAt ?? null, intlLocale(locale));
  const noIncome = phase?.gaps.includes('NO_INCOME') ?? false;

  return (
    <section className="benchmarks" aria-labelledby={`${id}-title`} aria-busy={status === 'loading'}>
      <h4 className="phase-details__heading" id={`${id}-title`}>
        {t('benchmarks.title')}
      </h4>

      {status === 'loading' && !benchmarks && (
        <div className="benchmarks__skeleton" role="status">
          <span className="visually-hidden">{t('benchmarks.loading')}</span>
          <span className="benchmarks__skeleton-bar" aria-hidden="true" />
          <span className="benchmarks__skeleton-bar" aria-hidden="true" />
        </div>
      )}

      {status !== 'loading' && status !== 'ready' && (
        <div className="benchmarks__problem">
          <p className="form-error-text" role="alert">
            {message ?? t('benchmarks.loadError')}
          </p>
          <button type="button" className="btn-secondary-cancel" onClick={onRetry}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      {benchmarks && !phase && <p className="phase-details__hint">{t('benchmarks.none')}</p>}

      {described && noIncome && !described.hasComparison && (
        <p className="phase-details__hint">{described.gaps[0]}</p>
      )}

      {described && !(noIncome && !described.hasComparison) && (
        <>
          <ul className="benchmarks__badges">
            {described.positioning.badges.map((badge) => (
              <li key={badge.scope}>
                <span className={`benchmarks__badge${badge.scope === 'COUNTRY' ? ' benchmarks__badge--primary' : ''}`} data-scope={badge.scope}>
                  {badge.text}
                </span>
              </li>
            ))}
            {described.positioning.equivalences.map((equivalence) => (
              <li key={equivalence.countryCode} className="benchmarks__equivalence">
                <span>{equivalence.text}</span>
                {equivalence.tier && <span className="benchmarks__badge">{equivalence.tier}</span>}
              </li>
            ))}
          </ul>
          {described.positioning.insights.length > 0 && (
            <ul className="benchmarks__insights" aria-label={t('benchmarks.howYouCompare')}>
              {described.positioning.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {benchmarks && phase && !(noIncome && !described?.hasComparison) && (
        <details className="benchmarks__how">
          <summary>{t('benchmarks.dataSources')}</summary>
          <ul className="benchmarks__figures">
            {described?.income && <Figure metric="income" kpi={described.income} />}
            {described?.areaFigures.map((kpi) => <Figure key={kpi.label} metric="area" kpi={kpi} />)}
            {described?.housing && <Figure metric="housing" kpi={described.housing} verdict={described.housing.verdict} />}
            {described?.purchasingPower && <Figure metric="purchasing-power" kpi={described.purchasingPower} />}
          </ul>
          {described && described.sources.length > 0 && (
            <ul className="phase-details__hint benchmarks__sources" aria-label={t('benchmarks.sources')}>
              {described.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.name}
                  </a>
                  {source.retrieved ? t('benchmarks.retrieved', { date: source.retrieved }) : ''}
                </li>
              ))}
            </ul>
          )}
          <ul className="phase-details__hint benchmarks__notes">
            {described?.gaps.map((gap) => <li key={gap}>{gap}</li>)}
            {described?.positioning.unavailable.map((note) => <li key={note}>{note}</li>)}
            <li>{t('benchmarks.note.national')}</li>
            <li>{t('benchmarks.note.income')}</li>
            <li>{t('benchmarks.note.housing')}</li>
            <li>{t('benchmarks.note.power')}</li>
            <li>{t('benchmarks.note.argentina')}</li>
            <li>{t('benchmarks.note.areas')}</li>
            <li>{t('benchmarks.note.surveys')}</li>
            <li>{t('benchmarks.note.refresh', { refreshed: refreshed ? t('benchmarks.lastRefreshed', { date: refreshed }) : '.' })}</li>
          </ul>
        </details>
      )}
    </section>
  );
}
