import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PhaseComparisonResponse } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { usePhaseComparison } from '../usePhaseComparison';

const comparison: PhaseComparisonResponse = {
  comparable: true,
  fromPhaseId: 'a',
  toPhaseId: 'b',
  currency: 'EUR',
  monthlyIncomeDeltaMinor: 0,
  monthlyFixedCostsDeltaMinor: 0,
  savingsCapacityDeltaMinor: 0,
  fixedCostsDeltaFraction: 0,
  categories: [],
};

describe('usePhaseComparison', () => {
  it('stays idle until two phases are chosen', () => {
    const compare = vi.fn();

    const { result } = renderHook(() => usePhaseComparison(compare, 'a', null));

    expect(result.current).toEqual({ status: 'idle' });
    expect(compare).not.toHaveBeenCalled();
  });

  it('loads, then shows the comparison', async () => {
    const compare = vi.fn().mockResolvedValue({ ok: true, value: comparison } satisfies MutationResult<PhaseComparisonResponse>);

    const { result } = renderHook(() => usePhaseComparison(compare, 'a', 'b'));
    expect(result.current).toEqual({ status: 'loading' });

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', comparison }));
    expect(compare).toHaveBeenCalledWith('a', 'b');
  });

  it('shows the reason when the comparison fails', async () => {
    const compare = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Offline' } });

    const { result } = renderHook(() => usePhaseComparison(compare, 'a', 'b'));

    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: 'Offline' }));
  });

  it('follows the selection: a new pair loads again, clearing it goes idle', async () => {
    const compare = vi.fn().mockResolvedValue({ ok: true, value: comparison });
    const { result, rerender } = renderHook(({ from, to }) => usePhaseComparison(compare, from, to), {
      initialProps: { from: 'a' as string | null, to: 'b' as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ from: 'a', to: 'c' });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(compare).toHaveBeenLastCalledWith('a', 'c');

    rerender({ from: null, to: null });
    expect(result.current.status).toBe('idle');
  });

  it('asks again when the data it was computed from changes, keeping the old answer on screen meanwhile', async () => {
    const before = { ...comparison, monthlyFixedCostsDeltaMinor: -100 };
    const after = { ...comparison, monthlyFixedCostsDeltaMinor: -200 };
    const compare = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: before })
      .mockResolvedValueOnce({ ok: true, value: after });
    const { result, rerender } = renderHook(({ version }) => usePhaseComparison(compare, 'a', 'b', version), {
      initialProps: { version: 1 },
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', comparison: before }));

    rerender({ version: 2 });

    expect(result.current).toEqual({ status: 'ready', comparison: before });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', comparison: after }));
    expect(compare).toHaveBeenCalledTimes(2);
  });
});
