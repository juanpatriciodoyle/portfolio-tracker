import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from '../useCountUp';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCountUp', () => {
  it('starts from nothing and settles on the target', () => {
    const { result } = renderHook(() => useCountUp(500));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(1200));
    expect(result.current).toBe(500);
  });

  it('is already on the target when the figure arrives settled, with no entrance to replay', () => {
    const { result } = renderHook(() => useCountUp(500, { settled: true }));
    expect(result.current).toBe(500);
  });

  it('moves from where it stood when the target changes', () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { settled: true }), { initialProps: { target: 500 } });
    rerender({ target: 600 });
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toBeGreaterThan(500);
    expect(result.current).toBeLessThanOrEqual(600);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(600);
  });
});
