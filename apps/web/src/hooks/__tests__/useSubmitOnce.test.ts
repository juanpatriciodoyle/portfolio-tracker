import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSubmitOnce } from '../useSubmitOnce';

/** A promise the test settles by hand, so "in flight" lasts as long as the test needs. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSubmitOnce', () => {
  it('runs the action once when it is called twice in the same tick, before React could re-render', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    const gate = deferred<string>();
    const action = vi.fn(() => gate.promise);

    let first: Promise<string> | undefined;
    let second: Promise<string> | undefined;
    act(() => {
      first = result.current.run(action);
      second = result.current.run(action);
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();
    await act(async () => {
      gate.resolve('saved');
      await first;
    });
  });

  it('answers what the action answered', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    let answer: string | undefined;
    await act(async () => {
      answer = await result.current.run(async () => 'ok');
    });
    expect(answer).toBe('ok');
  });

  it('runs again once the first run has finished', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    const action = vi.fn(async () => 'done');

    await act(async () => {
      await result.current.run(action);
    });
    await act(async () => {
      await result.current.run(action);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });

  it('runs again after a run that failed, so a refused save can be retried', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    const action = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('saved');

    await act(async () => {
      await expect(result.current.run(action)).rejects.toThrow('offline');
    });
    await act(async () => {
      await result.current.run(action);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });

  it('runs again after an action that throws before it returns a promise', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    const action = vi.fn().mockImplementationOnce(() => {
      throw new Error('sync failure');
    });
    action.mockResolvedValueOnce('saved');

    act(() => {
      expect(() => result.current.run(action)).toThrow('sync failure');
    });
    await act(async () => {
      await result.current.run(action);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });

  it('is pending only while the action is in flight', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    const gate = deferred();
    expect(result.current.pending).toBe(false);

    let running: Promise<void> | undefined;
    act(() => {
      running = result.current.run(() => gate.promise);
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      gate.resolve();
      await running;
    });
    expect(result.current.pending).toBe(false);
  });

  it('is not pending any more after a failed run', async () => {
    const { result } = renderHook(() => useSubmitOnce());
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('no')))?.catch(() => undefined);
    });
    expect(result.current.pending).toBe(false);
  });

  it('does not touch state after it was unmounted mid-flight', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useSubmitOnce());
    const gate = deferred();

    let running: Promise<void> | undefined;
    act(() => {
      running = result.current.run(() => gate.promise);
    });
    unmount();
    gate.resolve();
    await running;

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps one stable run function across renders', () => {
    const { result, rerender } = renderHook(() => useSubmitOnce());
    const first = result.current.run;
    rerender();
    expect(result.current.run).toBe(first);
  });
});
