import { useCallback, useEffect, useState } from 'react';
import { usageAnalyticsResponse, type UsageAnalyticsResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus } from '../lib/apiErrors';

interface UsageAnalyticsState {
  status: LoadStatus;
  /** What went wrong, in words fit for the screen; null unless it did. */
  message: string | null;
  analytics: UsageAnalyticsResponse | null;
}

const INITIAL_STATE: UsageAnalyticsState = { status: 'loading', message: null, analytics: null };

/**
 * How many people use the app: for the admin only (the server answers anyone else with a refusal). Loads each time it
 * is switched on, so the figures are current when the tab opens; the previous figures stay on screen while it
 * refreshes, and a failure leaves them as they were.
 */
export function useUsageAnalytics(enabled: boolean) {
  const [state, setState] = useState<UsageAnalyticsState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/admin/analytics', usageAnalyticsResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, analytics: result.value }
          : { ...previous, status: statusFromFailure(result.failure), message: result.failure.message },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading', message: null }));
    setReloadKey((key) => key + 1);
  }, []);

  return { ...state, reload };
}
