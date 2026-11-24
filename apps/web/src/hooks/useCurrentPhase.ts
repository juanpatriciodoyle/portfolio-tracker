import { useEffect, useState } from 'react';
import { timelineResponse, type TimelineEntryDto } from '../contracts';
import { apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus } from '../lib/apiErrors';

interface CurrentPhaseState {
  status: LoadStatus;
  /** The home lived in today; null when there is none. */
  phase: TimelineEntryDto | null;
}

/**
 * The home the person lives in today, with what it costs and what it leaves, from the timeline. Loads once `enabled`, and
 * again whenever `version` changes. The previous answer stays while it refreshes; a failure leaves it as it was.
 */
export function useCurrentPhase(enabled: boolean, version: unknown): CurrentPhaseState {
  const [state, setState] = useState<CurrentPhaseState>({ status: 'loading', phase: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/living-phases/timeline', timelineResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok ? { status: 'ready', phase: result.value.entries.find(({ status }) => status === 'current') ?? null } : { ...previous, status: statusFromFailure(result.failure) },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  return state;
}
