import { useEffect, useState } from 'react';
import type { PhaseComparisonResponse } from '../contracts';
import type { MutationResult } from '../lib/apiErrors';

export type ComparisonState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; comparison: PhaseComparisonResponse }
  | { status: 'error'; message: string };

type CompareFn = (fromId: string, toId: string) => Promise<MutationResult<PhaseComparisonResponse>>;

/**
 * Compares two phases (deltas are `to` minus `from`) and follows the selection as it changes.
 * `dataVersion` is anything that changes when the phases the comparison was computed from change
 * (e.g. the reloaded timeline): the comparison is asked for again, and the old answer stays on
 * screen until the new one arrives, so nothing flickers and nothing stays stale.
 */
export function usePhaseComparison(
  compare: CompareFn,
  fromId: string | null,
  toId: string | null,
  dataVersion?: unknown
): ComparisonState {
  const [settled, setSettled] = useState<{ key: string; state: ComparisonState } | null>(null);
  const key = fromId && toId ? `${fromId}>${toId}` : null;

  useEffect(() => {
    if (!fromId || !toId || key === null) return;
    let cancelled = false;
    void compare(fromId, toId).then((result) => {
      if (cancelled) return;
      setSettled({
        key,
        state: result.ok
          ? { status: 'ready', comparison: result.value }
          : { status: 'error', message: result.failure.message },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [compare, fromId, toId, key, dataVersion]);

  if (key === null) return { status: 'idle' };
  return settled?.key === key ? settled.state : { status: 'loading' };
}
