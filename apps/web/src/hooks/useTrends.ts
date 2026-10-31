import { useCallback, useEffect, useState } from 'react';
import { trendsResponse, type TrendsResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus } from '../lib/apiErrors';

interface TrendsState {
  status: LoadStatus;
  message: string | null;
  trends: TrendsResponse | null;
}

const INITIAL_STATE: TrendsState = { status: 'loading', message: null, trends: null };

/**
 * The rolling 3, 6 and 12-month averages of what bills really cost. Loads once `enabled`, and again
 * whenever `version` changes (pass the data the numbers depend on, such as the reloaded phases) or
 * `reload` is called after a bill changes. The previous numbers stay on screen while it refreshes.
 */
export function useTrends(enabled: boolean, version: unknown) {
  const [state, setState] = useState<TrendsState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/insights/trends', trendsResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, trends: result.value }
          : { ...previous, status: statusFromFailure(result.failure), message: result.failure.message }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...state, reload };
}

export type TrendsApi = ReturnType<typeof useTrends>;
