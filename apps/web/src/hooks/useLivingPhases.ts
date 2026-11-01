import { useCallback, useEffect, useState } from 'react';
import {
  idResponse,
  listLivingPhasesResponse,
  phaseComparisonResponse,
  timelineResponse,
  type CreateFixedCostRequest,
  type CreateLivingPhaseInput,
  type LivingPhaseDto,
  type TimelineEntryDto,
  type UpdateFixedCostRequest,
  type UpdateLivingPhaseRequest,
} from '../contracts';
import { apiCommand, apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus, type MutationResult } from '../lib/apiErrors';
import { withDisplayNames } from '../lib/phaseName';

interface LivingPhasesState {
  status: LoadStatus;
  message: string | null;
  phases: LivingPhaseDto[];
  entries: TimelineEntryDto[];
  asOf: string | null;
}

const INITIAL_STATE: LivingPhasesState = { status: 'loading', message: null, phases: [], entries: [], asOf: null };

const PHASES_PATH = '/api/living-phases';
const phasePath = (phaseId: string) => `${PHASES_PATH}/${encodeURIComponent(phaseId)}`;
const costsPath = (phaseId: string) => `${phasePath(phaseId)}/fixed-costs`;
const costPath = (phaseId: string, costId: string) => `${costsPath(phaseId)}/${encodeURIComponent(costId)}`;

/** Living phases with their computed timeline, plus every change a person can make to them. */
export function useLivingPhases() {
  const [state, setState] = useState<LivingPhasesState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await attempt(async () => {
        const [list, timeline] = await Promise.all([
          apiRequest(PHASES_PATH, listLivingPhasesResponse),
          apiRequest(`${PHASES_PATH}/timeline`, timelineResponse),
        ]);
        return { ...withDisplayNames(list.phases, timeline.entries), asOf: timeline.asOf };
      });
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, ...result.value }
          : { ...previous, status: statusFromFailure(result.failure), message: result.failure.message }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Loads again; shows the loading state only when there is no good data on screen. */
  const reload = useCallback(() => {
    setState((previous) => (previous.status === 'ready' ? previous : { ...previous, status: 'loading', message: null }));
    setReloadKey((key) => key + 1);
  }, []);

  const runMutation = useCallback(async <T>(action: () => Promise<T>): Promise<MutationResult<T>> => {
    const result = await attempt(action);
    if (result.ok) {
      setReloadKey((key) => key + 1);
    } else if (result.failure.kind === 'signed-out' || result.failure.kind === 'encryption-unavailable') {
      const failure = result.failure;
      setState((previous) => ({ ...previous, status: statusFromFailure(failure), message: failure.message }));
    }
    return result;
  }, []);

  const createPhase = useCallback(
    (input: CreateLivingPhaseInput) => runMutation(() => apiRequest(PHASES_PATH, idResponse, { method: 'POST', body: input })),
    [runMutation]
  );
  const updatePhase = useCallback(
    (phaseId: string, input: UpdateLivingPhaseRequest) =>
      runMutation(() => apiCommand(phasePath(phaseId), { method: 'PATCH', body: input })),
    [runMutation]
  );
  const deletePhase = useCallback(
    (phaseId: string) => runMutation(() => apiCommand(phasePath(phaseId), { method: 'DELETE' })),
    [runMutation]
  );
  const addFixedCost = useCallback(
    (phaseId: string, input: CreateFixedCostRequest) =>
      runMutation(() => apiRequest(costsPath(phaseId), idResponse, { method: 'POST', body: input })),
    [runMutation]
  );
  const updateFixedCost = useCallback(
    (phaseId: string, costId: string, input: UpdateFixedCostRequest) =>
      runMutation(() => apiCommand(costPath(phaseId, costId), { method: 'PATCH', body: input })),
    [runMutation]
  );
  const deleteFixedCost = useCallback(
    (phaseId: string, costId: string) => runMutation(() => apiCommand(costPath(phaseId, costId), { method: 'DELETE' })),
    [runMutation]
  );

  /** A query: it never changes anything, so it does not reload the lists. */
  const compare = useCallback(
    (fromId: string, toId: string) =>
      attempt(() =>
        apiRequest(`${PHASES_PATH}/compare?${new URLSearchParams({ from: fromId, to: toId }).toString()}`, phaseComparisonResponse)
      ),
    []
  );

  return {
    ...state,
    reload,
    createPhase,
    updatePhase,
    deletePhase,
    addFixedCost,
    updateFixedCost,
    deleteFixedCost,
    compare,
  };
}

export type LivingPhasesApi = ReturnType<typeof useLivingPhases>;
