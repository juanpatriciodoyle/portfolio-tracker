import { ACTIVE_CUSTOMER_MONTHS, type UsageAnalyticsResponse } from '../../contracts';
import { useCountUp } from '../../hooks/useCountUp';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
import type { LoadStatus } from '../../lib/apiErrors';
import { displayLocale, formatCalendarDate, formatCount, formatPercent } from '../../lib/money';

interface UsageAnalyticsProps {
  status: LoadStatus;
  /** What went wrong, when something did. */
  message: string | null;
  analytics: UsageAnalyticsResponse | null;
  onRetry: () => void | Promise<void>;
}

/** A whole number that settles into place. Assistive technology reads the final figure, never the ones on the way. */
function Count({ value }: { value: number }) {
  const shown = useCountUp(value);
  return (
    <span role="img" aria-label={formatCount(value)}>
      {formatCount(shown)}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="hero__skeleton" aria-hidden="true">
      {[0, 1].map((block) => (
        <div key={block} className="hero__skeleton-block">
          <span className="hero__skeleton-line hero__skeleton-line--label" />
          <span className="hero__skeleton-line hero__skeleton-line--amount" />
          <span className="hero__skeleton-line hero__skeleton-line--gain" />
        </div>
      ))}
    </div>
  );
}

/** How many customers there are and how many of them have signed in lately. What the admin sees in the Analytics tab. */
export default function UsageAnalytics({ status, message, analytics, onRetry }: UsageAnalyticsProps) {
  const { run, pending } = useSubmitOnce();
  const failed = status !== 'ready' && status !== 'loading';

  return (
    <section className="usage-analytics" aria-label="Customers" aria-busy={status === 'loading'}>
      {failed && (
        <div className="profile-banner profile-banner--error" role="alert">
          <p>{message ?? 'Something went wrong.'}</p>
          {status === 'error' && (
            <button type="button" className="btn-secondary-cancel profile-banner__action" disabled={pending} aria-busy={pending} onClick={() => void run(async () => onRetry())}>
              Try again
            </button>
          )}
        </div>
      )}

      {analytics === null ? (
        !failed && <Skeleton />
      ) : analytics.registered === 0 ? (
        <p className="usage-analytics__empty">No customers yet</p>
      ) : (
        <>
          <div className="hero__figures">
            <div className="hero__figure usage-analytics__figure">
              <p className="hero__label">Customers</p>
              <p className="hero__amount">
                <Count value={analytics.registered} />
              </p>
            </div>
            <div className="hero__figure usage-analytics__figure">
              <p className="hero__label">Active customers</p>
              <p className="hero__amount">
                <Count value={analytics.active} />
              </p>
              <p className="hero__meta">{formatPercent(analytics.activePercent / 100, displayLocale(), 1)} of customers</p>
              <p className="hero__meta">
                Signed in since {formatCalendarDate(analytics.activeSince)} (the last {ACTIVE_CUSTOMER_MONTHS} months)
              </p>
            </div>
          </div>
          <p className="hero__note">As of {formatCalendarDate(analytics.asOf)}</p>
        </>
      )}
    </section>
  );
}
