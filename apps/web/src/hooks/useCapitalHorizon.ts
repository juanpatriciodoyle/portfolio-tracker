import { useCallback, useEffect, useState } from 'react';
import { capitalHorizonResponse, type CapitalHorizonResponse, type CapitalMilestone } from '../contracts';
import { apiCommand, apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus, type MutationResult } from '../lib/apiErrors';

interface CapitalHorizonState {
  status: LoadStatus;
  capitalHorizon: CapitalHorizonResponse | null;
}

const INITIAL_STATE: CapitalHorizonState = { status: 'loading', capitalHorizon: null };

/**
 * The goals saved toward and how far each is from the portfolio. Loads once `enabled`, and again
 * whenever `version` changes (pass the portfolio value) or the goals are saved. The previous numbers
 * stay on screen while it refreshes; a failure leaves them as they were.
 */
export function useCapitalHorizon(enabled: boolean, version: unknown) {
  const [state, setState] = useState<CapitalHorizonState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/insights/capital-horizon', capitalHorizonResponse));
      if (cancelled) return;
      setState((previous) => (result.ok ? { status: 'ready', capitalHorizon: result.value } : { ...previous, status: statusFromFailure(result.failure) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version, reloadKey]);

  /** Replaces every goal with `milestones`, then loads the new pace. */
  const save = useCallback(async (milestones: readonly CapitalMilestone[]): Promise<MutationResult> => {
    const result = await attempt(() => apiCommand('/api/profile/capital-milestones', { method: 'PUT', body: { milestones } }));
    if (result.ok) setReloadKey((key) => key + 1);
    return result;
  }, []);

  return { ...state, save };
}
