import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeUsageAnalytics } from '../../test/fixtures';
import { useUsageAnalytics } from '../useUsageAnalytics';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;

beforeEach(() => apiRequest.mockReset());

describe('useUsageAnalytics', () => {
  it('asks nothing until it is enabled: nobody but the admin has a reason to', () => {
    apiRequest.mockResolvedValue(makeUsageAnalytics());
    const { result } = renderHook(() => useUsageAnalytics(false));

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
    expect(result.current.analytics).toBeNull();
  });

  it('loads the figures once enabled, parsed with the contract', async () => {
    apiRequest.mockResolvedValue(makeUsageAnalytics());
    const { result, rerender } = renderHook(({ enabled }) => useUsageAnalytics(enabled), { initialProps: { enabled: false } });

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(apiRequest).toHaveBeenCalledWith('/api/admin/analytics', expect.anything());
    expect(result.current.analytics).toEqual(makeUsageAnalytics());
  });

  it('says in plain words that the session ended when the server refuses the person (403)', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(403, 'Forbidden', { error: 'Only the admin can see this.' }));
    const { result } = renderHook(() => useUsageAnalytics(true));

    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.message).toBe('Your session has ended. Sign in again to continue.');
    expect(result.current.analytics).toBeNull();
  });

  it('reports a server failure as an error with advice, not a crash', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(500, 'Internal Server Error', null));
    const { result } = renderHook(() => useUsageAnalytics(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.message).toMatch(/try again/i);
  });

  it('asks again on reload, shows loading meanwhile, and keeps the old figures if it fails', async () => {
    apiRequest.mockResolvedValueOnce(makeUsageAnalytics()).mockRejectedValueOnce(new ApiError(500, 'Internal Server Error', null));
    const { result } = renderHook(() => useUsageAnalytics(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.analytics).toEqual(makeUsageAnalytics());
  });

  it('asks again each time it is switched back on, so the figures are current when the tab opens', async () => {
    apiRequest.mockResolvedValueOnce(makeUsageAnalytics({ registered: 48 })).mockResolvedValueOnce(makeUsageAnalytics({ registered: 51 }));
    const { result, rerender } = renderHook(({ enabled }) => useUsageAnalytics(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.analytics?.registered).toBe(48));

    rerender({ enabled: false });
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.analytics?.registered).toBe(51));
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
