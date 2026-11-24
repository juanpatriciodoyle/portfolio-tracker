import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import { useAppConfig } from '../useAppConfig';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const apiRequest = client.apiRequest as unknown as Mock<(path: string, schema: unknown) => Promise<unknown>>;

beforeEach(() => {
  apiRequest.mockReset();
});

describe('useAppConfig', () => {
  it('does not know yet while it asks, so nothing optional is shown for a moment', () => {
    apiRequest.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAppConfig());
    expect(result.current.demoEnabled).toBeNull();
  });

  it.each([true, false])('says what the server said about the sneak peek (%s)', async (demoEnabled) => {
    apiRequest.mockResolvedValue({ demoEnabled, captchaSiteKey: null });
    const { result } = renderHook(() => useAppConfig());

    await waitFor(() => expect(result.current.demoEnabled).toBe(demoEnabled));
    expect(apiRequest).toHaveBeenCalledWith('/api/config', expect.anything());
  });

  it('stays "unknown" when the server cannot be reached or answers wrongly: the safe choice is to show nothing extra', async () => {
    apiRequest.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAppConfig());

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current.demoEnabled).toBeNull();
  });

  it('gives the public key of the human check when the server asks for one, and none when it does not', async () => {
    apiRequest.mockResolvedValueOnce({ demoEnabled: true, captchaSiteKey: 'site-key' });
    const on = renderHook(() => useAppConfig());
    await waitFor(() => expect(on.result.current.captchaSiteKey).toBe('site-key'));

    apiRequest.mockResolvedValueOnce({ demoEnabled: true, captchaSiteKey: null });
    const off = renderHook(() => useAppConfig());
    await waitFor(() => expect(off.result.current.demoEnabled).toBe(true));
    expect(off.result.current.captchaSiteKey).toBeNull();
  });
});
