import { useCallback, useEffect, useState } from 'react';
import {
  idResponse,
  listBillingRecordsResponse,
  type BillingRecordDto,
  type CreateBillingRecordRequest,
  type UpdateBillingRecordRequest,
} from '../contracts';
import { apiCommand, apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus, type MutationResult } from '../lib/apiErrors';

interface BillingState {
  status: LoadStatus;
  message: string | null;
  records: BillingRecordDto[];
}

const INITIAL_STATE: BillingState = { status: 'loading', message: null, records: [] };

const RECORDS_PATH = '/api/billing-records';
const recordPath = (recordId: string) => `${RECORDS_PATH}/${encodeURIComponent(recordId)}`;

/**
 * The bills a person has logged, for every living phase, plus adding, changing and removing them.
 * Loads once `enabled` and again when `version` changes. `onChanged` runs after any successful change,
 * so the numbers built from the bills (the trends) can refresh too.
 */
export function useBillingRecords(enabled: boolean, version: unknown, onChanged?: () => void) {
  const [state, setState] = useState<BillingState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest(RECORDS_PATH, listBillingRecordsResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, records: result.value.records }
          : { ...previous, status: statusFromFailure(result.failure), message: result.failure.message }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version, reloadKey]);

  const runMutation = useCallback(
    async <T>(action: () => Promise<T>): Promise<MutationResult<T>> => {
      const result = await attempt(action);
      if (result.ok) {
        setReloadKey((key) => key + 1);
        onChanged?.();
      }
      return result;
    },
    [onChanged]
  );

  const createBill = useCallback(
    (input: CreateBillingRecordRequest) => runMutation(() => apiRequest(RECORDS_PATH, idResponse, { method: 'POST', body: input })),
    [runMutation]
  );
  const updateBill = useCallback(
    (recordId: string, input: UpdateBillingRecordRequest) =>
      runMutation(() => apiCommand(recordPath(recordId), { method: 'PATCH', body: input })),
    [runMutation]
  );
  const deleteBill = useCallback(
    (recordId: string) => runMutation(() => apiCommand(recordPath(recordId), { method: 'DELETE' })),
    [runMutation]
  );

  return { ...state, createBill, updateBill, deleteBill };
}

export type BillingRecordsApi = ReturnType<typeof useBillingRecords>;
