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
    apiRequest.mockResolvedValue({ demoEnabled });
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
});
