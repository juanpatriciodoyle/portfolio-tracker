import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import type { RequestOptions } from '../../lib/apiClient';
import { useBenchmarkPreview } from '../useBenchmarkPreview';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;

const answer = { countryCode: 'ES', typicalMonthlyIncome: null, incomePercentile: null, rent: null, gaps: [] };

beforeEach(() => {
  vi.useFakeTimers();
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(answer);
});
afterEach(() => vi.useRealTimers());

const settle = async (ms = 500) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useBenchmarkPreview', () => {
  it('asks nothing until there is a country', async () => {
    const { result } = renderHook(() => useBenchmarkPreview(null));
    await settle();

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('waits for the person to stop typing, then asks once with what was typed', async () => {
    const { rerender } = renderHook(({ income }) => useBenchmarkPreview({ countryCode: 'ES', currency: 'EUR', monthlyIncomeMinor: income }), { initialProps: { income: 3 } });
    await settle(200);
    rerender({ income: 32 });
    await settle(200);
    rerender({ income: 320000 });
    await settle(100);
    expect(apiRequest).not.toHaveBeenCalled();

    await settle(400);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/insights/benchmarks/preview?countryCode=ES&currency=EUR&monthlyIncomeMinor=320000');
  });

  it('answers with what the server knows, and leaves out an amount that was not typed', async () => {
    const { result } = renderHook(() => useBenchmarkPreview({ countryCode: 'ES', currency: 'EUR' }));
    await settle();

    expect(result.current).toEqual(answer);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/insights/benchmarks/preview?countryCode=ES&currency=EUR');
  });

  it('is simply silent when the server cannot answer: it is a nicety, never an error', async () => {
    apiRequest.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => useBenchmarkPreview({ countryCode: 'ES', currency: 'EUR' }));
    await settle();

    expect(result.current).toBeNull();
  });

  it('forgets the answer for another country instead of showing it under the wrong one', async () => {
    const { result, rerender } = renderHook(({ country }) => useBenchmarkPreview(country ? { countryCode: country, currency: 'EUR' } : null), { initialProps: { country: 'ES' as string | null } });
    await settle();
    expect(result.current).toEqual(answer);

    rerender({ country: null });
    await settle();
    expect(result.current).toBeNull();

    rerender({ country: 'FR' });
    expect(result.current).toBeNull();
  });
});
