import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED } from '../../contracts';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeProfile } from '../../test/fixtures';
import { useProfile } from '../useProfile';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
type CommandFn = (path: string, options: RequestOptions) => Promise<void>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;
const apiCommand = client.apiCommand as unknown as Mock<CommandFn>;

beforeEach(() => {
  apiRequest.mockReset();
  apiCommand.mockReset();
  apiCommand.mockResolvedValue(undefined);
});

describe('useProfile', () => {
  it('loads the profile', async () => {
    apiRequest.mockResolvedValue(makeProfile());

    const { result } = renderHook(() => useProfile());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.profile).toEqual(makeProfile());
    expect(apiRequest.mock.calls[0][0]).toBe('/api/profile');
  });

  it('saves with PUT and shows the saved profile without another round trip', async () => {
    apiRequest.mockResolvedValue(makeProfile());
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const changed = makeProfile({ fullName: 'Juan P. Doyle', dependentChildren: 1 });
    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      outcome = await result.current.save(changed);
    });

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(apiCommand).toHaveBeenCalledWith('/api/profile', { method: 'PUT', body: changed });
    expect(result.current.profile).toEqual(changed);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps the old profile and returns the field problems when the server rejects a save', async () => {
    apiRequest.mockResolvedValue(makeProfile());
    apiCommand.mockRejectedValue(
      new ApiError(400, 'Invalid request', { error: 'Invalid request', issues: [{ path: 'birthYear', message: 'Too early' }] })
    );
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      outcome = await result.current.save(makeProfile({ birthYear: 1850 }));
    });

    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'validation', issues: [{ path: 'birthYear' }] } });
    expect(result.current.profile).toEqual(makeProfile());
    expect(result.current.status).toBe('ready');
  });

  it('reports a signed-out session and a missing encryption key', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError(401, 'Access denied', null));
    const signedOut = renderHook(() => useProfile());
    await waitFor(() => expect(signedOut.result.current.status).toBe('signed-out'));

    apiRequest.mockRejectedValueOnce(new ApiError(503, 'No key', { error: 'No key', code: ENCRYPTION_NOT_CONFIGURED }));
    const unavailable = renderHook(() => useProfile());
    await waitFor(() => expect(unavailable.result.current.status).toBe('encryption-unavailable'));
  });

  it('retries after an error', async () => {
    apiRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.status).toBe('error'));

    apiRequest.mockResolvedValue(makeProfile());
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
