import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeSecondSalary } from '../../test/fixtures';
import { useSecondSalary } from '../useSecondSalary';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;
const apiCommand = client.apiCommand as unknown as Mock<(path: string, options: RequestOptions) => Promise<void>>;

beforeEach(() => {
  apiRequest.mockReset();
  apiCommand.mockReset();
});

describe('useSecondSalary', () => {
  it('waits until it is enabled before asking the server', async () => {
    apiRequest.mockResolvedValue(makeSecondSalary());
    const { result, rerender } = renderHook(({ enabled }) => useSecondSalary(enabled, 0), { initialProps: { enabled: false } });
    expect(apiRequest).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(apiRequest).toHaveBeenCalledWith('/api/insights/second-salary', expect.anything());
    expect(result.current.secondSalary?.secondSalaryMinor).toBe(100_000);
  });

  it('asks again when the portfolio value changes, keeping the old numbers meanwhile', async () => {
    apiRequest.mockResolvedValueOnce(makeSecondSalary({ secondSalaryMinor: 100_000 })).mockResolvedValueOnce(makeSecondSalary({ secondSalaryMinor: 120_000 }));
    const { result, rerender } = renderHook(({ version }) => useSecondSalary(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.secondSalary?.secondSalaryMinor).toBe(100_000));

    rerender({ version: 2 });
    expect(result.current.secondSalary?.secondSalaryMinor).toBe(100_000);
    await waitFor(() => expect(result.current.secondSalary?.secondSalaryMinor).toBe(120_000));
  });

  it('keeps the last numbers when a refresh fails', async () => {
    apiRequest.mockResolvedValueOnce(makeSecondSalary()).mockRejectedValueOnce(new ApiError(500, 'Server error', null));
    const { result, rerender } = renderHook(({ version }) => useSecondSalary(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ version: 2 });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.secondSalary).not.toBeNull();
  });

  it('saves the target and then loads the new progress', async () => {
    apiCommand.mockResolvedValue(undefined);
    apiRequest.mockResolvedValueOnce(makeSecondSalary({ target: null })).mockResolvedValueOnce(makeSecondSalary());
    const { result } = renderHook(() => useSecondSalary(true, 0));
    await waitFor(() => expect(result.current.secondSalary?.target).toBeNull());

    await act(async () => {
      expect((await result.current.saveTarget(250_000)).ok).toBe(true);
    });

    expect(apiCommand).toHaveBeenCalledWith('/api/profile/second-salary-target', { method: 'PUT', body: { monthlyMinor: 250_000 } });
    await waitFor(() => expect(result.current.secondSalary?.target?.monthlyMinor).toBe(250_000));
  });

  it('does not reload when saving the target fails', async () => {
    apiCommand.mockRejectedValue(new ApiError(500, 'Server error', null));
    apiRequest.mockResolvedValue(makeSecondSalary());
    const { result } = renderHook(() => useSecondSalary(true, 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      expect((await result.current.saveTarget(250_000)).ok).toBe(false);
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
