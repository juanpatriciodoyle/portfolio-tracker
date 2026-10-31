import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED } from '../../contracts';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeBenchmarks } from '../../test/benchmarkFixtures';
import { useBenchmarks } from '../useBenchmarks';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;

const loads = () => apiRequest.mock.calls.filter(([path]) => path === '/api/insights/benchmarks').length;

beforeEach(() => {
  apiRequest.mockReset();
});

describe('useBenchmarks', () => {
  it('waits until it is enabled before asking the server', async () => {
    apiRequest.mockResolvedValue(makeBenchmarks());

    const { result, rerender } = renderHook(({ enabled }) => useBenchmarks(enabled, null), { initialProps: { enabled: false } });
    expect(result.current.status).toBe('loading');
    expect(loads()).toBe(0);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(loads()).toBe(1);
    expect(result.current.benchmarks?.phases).toHaveLength(1);
  });

  it('asks again when the data it depends on changes, keeping the old numbers on screen meanwhile', async () => {
    const before = makeBenchmarks({ refreshedAt: '2026-10-01T00:00:00.000Z' });
    const after = makeBenchmarks({ refreshedAt: '2026-10-20T00:00:00.000Z' });
    apiRequest.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { result, rerender } = renderHook(({ version }) => useBenchmarks(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.benchmarks).toEqual(before));

    rerender({ version: 2 });

    expect(result.current.benchmarks).toEqual(before);
    await waitFor(() => expect(result.current.benchmarks).toEqual(after));
    expect(loads()).toBe(2);
  });

  it('reloads on request, for example after a bill changes', async () => {
    apiRequest.mockResolvedValue(makeBenchmarks());
    const { result } = renderHook(() => useBenchmarks(true, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.reload());

    await waitFor(() => expect(loads()).toBe(2));
  });

  it('keeps showing the last good numbers when a refresh fails, and says why', async () => {
    const good = makeBenchmarks();
    apiRequest.mockResolvedValueOnce(good).mockRejectedValueOnce(new TypeError('network down'));
    const { result } = renderHook(() => useBenchmarks(true, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.benchmarks).toEqual(good);
    expect(result.current.message).toMatch(/Could not reach the server/);
  });

  it('reports a signed-out session and a server without an encryption key', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(401, 'Access denied', { error: 'Access denied' }));
    const signedOut = renderHook(() => useBenchmarks(true, null));
    await waitFor(() => expect(signedOut.result.current.status).toBe('signed-out'));

    apiRequest.mockRejectedValueOnce(new ApiError(503, 'No key', { error: 'No key', code: ENCRYPTION_NOT_CONFIGURED }));
    const noKey = renderHook(() => useBenchmarks(true, null));
    await waitFor(() => expect(noKey.result.current.status).toBe('encryption-unavailable'));
  });

  it('parses the answer with the shared contract', async () => {
    apiRequest.mockResolvedValue(makeBenchmarks());
    renderHook(() => useBenchmarks(true, null));
    await waitFor(() => expect(loads()).toBe(1));

    const [, schema] = apiRequest.mock.calls[0];
    expect((schema as { safeParse: (value: unknown) => { success: boolean } }).safeParse(makeBenchmarks()).success).toBe(true);
    expect((schema as { safeParse: (value: unknown) => { success: boolean } }).safeParse({ nope: true }).success).toBe(false);
  });
});
