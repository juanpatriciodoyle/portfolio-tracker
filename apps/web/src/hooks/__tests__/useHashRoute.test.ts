import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHashRoute } from '../useHashRoute';

function goTo(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
}

describe('useHashRoute', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('treats an empty hash as the dashboard', () => {
    const { result } = renderHook(() => useHashRoute());

    expect(result.current.path).toBe('/');
  });

  it('starts on the route already in the address bar', () => {
    window.location.hash = '#/profile';

    const { result } = renderHook(() => useHashRoute());

    expect(result.current.path).toBe('/profile');
  });

  it('follows the back and forward buttons', () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => goTo('#/profile'));
    expect(result.current.path).toBe('/profile');

    act(() => goTo(''));
    expect(result.current.path).toBe('/');
  });

  it('navigates by setting the hash', () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      result.current.navigate('/profile');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(window.location.hash).toBe('#/profile');
    expect(result.current.path).toBe('/profile');
  });
});
