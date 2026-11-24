import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import { useHomeGoals } from '../useHomeGoals';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const apiRequest = client.apiRequest as unknown as Mock<(path: string, schema: unknown) => Promise<unknown>>;

const current = { phaseId: 'now', status: 'current', monthlyIncomeMinor: 320000 };
const past = { phaseId: 'before', status: 'past', monthlyIncomeMinor: 100000 };
const secondSalary = { secondSalaryMinor: 230000 };

function answers(overrides: Record<string, unknown | Error> = {}) {
  const byPath: Record<string, unknown | Error> = {
    '/api/living-phases/timeline': { asOf: '2026-11-24', entries: [past, current] },
    '/api/insights/second-salary': secondSalary,
    ...overrides,
  };
  apiRequest.mockImplementation(async (path) => {
    const answer = byPath[path];
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe('useHomeGoals', () => {
  it('is not ready while it asks, so the strip draws nothing yet', () => {
    apiRequest.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useHomeGoals(true, 1));
    expect(result.current.ready).toBe(false);
  });

  it('does not ask at all until it is enabled', () => {
    renderHook(() => useHomeGoals(false, 1));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('hands over the home lived in today and what the portfolio could pay', async () => {
    answers();
    const { result } = renderHook(() => useHomeGoals(true, 1));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.phase).toBe(current);
    expect(result.current.secondSalary).toBe(secondSalary);
  });

  it('has no home when none is being lived in', async () => {
    answers({ '/api/living-phases/timeline': { asOf: '2026-11-24', entries: [past] } });
    const { result } = renderHook(() => useHomeGoals(true, 1));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.phase).toBeNull();
  });

  it('stays quiet when the home cannot be read: no strip is better than a wrong one', async () => {
    answers({ '/api/living-phases/timeline': new Error('offline') });
    const { result } = renderHook(() => useHomeGoals(true, 1));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(result.current.ready).toBe(false);
  });

  it('still shows the home when the portfolio answer fails', async () => {
    answers({ '/api/insights/second-salary': new Error('boom') });
    const { result } = renderHook(() => useHomeGoals(true, 1));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.phase).toBe(current);
    expect(result.current.secondSalary).toBeNull();
  });

  it('reads again when the portfolio changes', async () => {
    answers();
    const { rerender } = renderHook(({ version }) => useHomeGoals(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));

    rerender({ version: 2 });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(4));
  });
});
