import { useEffect, useState } from 'react';
import { secondSalaryResponse, type SecondSalaryResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus } from '../lib/apiErrors';

interface SecondSalaryState {
  status: LoadStatus;
  secondSalary: SecondSalaryResponse | null;
}

const INITIAL_STATE: SecondSalaryState = { status: 'loading', secondSalary: null };

/**
 * What the portfolio could pay each month, against the costs of the current living phase. Loads once
 * `enabled`, and again whenever `version` changes (pass the portfolio value, so a new transaction moves it).
 * The previous numbers stay on screen while it refreshes; a failure leaves them as they were.
 */
export function useSecondSalary(enabled: boolean, version: unknown) {
  const [state, setState] = useState<SecondSalaryState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest('/api/insights/second-salary', secondSalaryResponse));
      if (cancelled) return;
      setState((previous) => (result.ok ? { status: 'ready', secondSalary: result.value } : { ...previous, status: statusFromFailure(result.failure) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  return state;
}
