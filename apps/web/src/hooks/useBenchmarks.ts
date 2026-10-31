import { useCallback, useEffect, useState } from 'react';
import { benchmarksResponse, type BenchmarksResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus } from '../lib/apiErrors';

interface BenchmarksState {
  status: LoadStatus;
  message: string | null;
  benchmarks: BenchmarksResponse | null;
}

const INITIAL_STATE: BenchmarksState = { status: 'loading', message: null, benchmarks: null };

/**
 * How each living phase compares with its country. Loads once `enabled`, and again whenever `version` changes
 * (pass the reloaded phases) or `reload` is called. The previous figures stay on screen while it refreshes.
 */
export function useBenchmarks(enabled: boolean, version: unknown) {
  const [state, setState] = useState<BenchmarksState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/insights/benchmarks', benchmarksResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, benchmarks: result.value }
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

export type BenchmarksApi = ReturnType<typeof useBenchmarks>;
