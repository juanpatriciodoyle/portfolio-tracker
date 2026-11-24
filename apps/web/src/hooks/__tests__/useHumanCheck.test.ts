import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHumanCheck } from '../useHumanCheck';

describe('useHumanCheck', () => {
  it('asks for nothing when the server has no check: no widget, no answer needed', () => {
    const { result } = renderHook(() => useHumanCheck(null));
    expect(result.current.required).toBe(false);
    expect(result.current.widget).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('is required, with no answer yet, when there is a site key', () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));
    expect(result.current.required).toBe(true);
    expect(result.current.token).toBeNull();
    expect(result.current.widget?.siteKey).toBe('site-key');
  });

  it('keeps the answer the widget reports, and drops it when it expires', () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));

    act(() => result.current.widget!.onToken('answer-1'));
    expect(result.current.token).toBe('answer-1');

    act(() => result.current.widget!.onExpire());
    expect(result.current.token).toBeNull();
  });

  it('starts over after an attempt: the answer is forgotten and the widget is told to reset', () => {
    const { result } = renderHook(() => useHumanCheck('site-key'));
    act(() => result.current.widget!.onToken('answer-1'));
    const before = result.current.widget!.resetCount;

    act(() => result.current.reset());

    expect(result.current.token).toBeNull();
    expect(result.current.widget!.resetCount).toBe(before + 1);
  });
});
