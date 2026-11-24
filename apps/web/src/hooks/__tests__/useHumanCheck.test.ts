import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HumanCheckIncompleteError, type HumanCheckHandle } from '../../lib/humanCheck';
import { useHumanCheck } from '../useHumanCheck';

const handleWith = (execute: HumanCheckHandle['execute']): HumanCheckHandle => ({ execute, reset: vi.fn() });

describe('useHumanCheck', () => {
  it('asks for nothing when the server has no check: solve answers undefined at once', async () => {
    const { result } = renderHook(() => useHumanCheck(null));
    expect(result.current.siteKey).toBeNull();
    await expect(result.current.solve()).resolves.toBeUndefined();
  });

  it('runs the check through the handle and gives its answer', async () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));
    act(() => result.current.attach(handleWith(async () => 'answer-1')));
    await expect(result.current.solve()).resolves.toBe('answer-1');
  });

  it('refuses to go on when the check is not on screen or was not completed', async () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));
    await expect(result.current.solve()).rejects.toBeInstanceOf(HumanCheckIncompleteError);

    act(() =>
      result.current.attach(
        handleWith(async () => {
          throw new HumanCheckIncompleteError();
        })
      )
    );
    await expect(result.current.solve()).rejects.toBeInstanceOf(HumanCheckIncompleteError);
  });

  it('starts the widget over on reset, and is harmless when there is none', () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));
    expect(() => result.current.reset()).not.toThrow();

    const handle = handleWith(async () => 'x');
    act(() => result.current.attach(handle));
    result.current.reset();
    expect(handle.reset).toHaveBeenCalledTimes(1);
  });
});
