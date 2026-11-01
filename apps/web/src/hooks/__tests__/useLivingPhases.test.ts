import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED, type CreateLivingPhaseInput } from '../../contracts';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeEntry, makePhase } from '../../test/fixtures';
import { useLivingPhases } from '../useLivingPhases';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
type CommandFn = (path: string, options: RequestOptions) => Promise<void>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;
const apiCommand = client.apiCommand as unknown as Mock<CommandFn>;

const LIST_PATH = '/api/living-phases';
const TIMELINE_PATH = '/api/living-phases/timeline';

/** Answers GETs with a small world; `overrides` replaces an answer (an Error is thrown). */
function serve(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    [LIST_PATH]: { phases: [makePhase()] },
    [TIMELINE_PATH]: { asOf: '2026-10-31', entries: [makeEntry()] },
    ...overrides,
  };
  apiRequest.mockImplementation(async (path, _schema, options) => {
    const key = options?.method && options.method !== 'GET' ? `${options.method} ${path.split('?')[0]}` : path.split('?')[0];
    const answer = answers[key];
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

const listLoads = () => apiRequest.mock.calls.filter(([path, , options]) => path === LIST_PATH && !options?.method).length;

const newPhase: CreateLivingPhaseInput = {
  name: 'Lisbon',
  city: 'Lisbon',
  countryCode: 'PT',
  tenure: 'RENT',
  startDate: '2020-01-01',
  endDate: '2022-08-31',
  currency: 'EUR',
  incomeStreams: [{ label: 'Salary', amountMinor: 280000, startDate: '2020-01-01', endDate: null }],
};

beforeEach(() => {
  apiRequest.mockReset();
  apiCommand.mockReset();
  apiCommand.mockResolvedValue(undefined);
});

describe('useLivingPhases loading', () => {
  it('loads the phases and the timeline', async () => {
    serve();

    const { result } = renderHook(() => useLivingPhases());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.phases.map((phase) => phase.id)).toEqual(['p1']);
    expect(result.current.entries[0].phaseId).toBe('p1');
    expect(result.current.asOf).toBe('2026-10-31');
  });

  it('reports a signed-out session', async () => {
    serve({ [LIST_PATH]: new ApiError(401, 'Access denied', { error: 'Access denied' }) });

    const { result } = renderHook(() => useLivingPhases());

    await waitFor(() => expect(result.current.status).toBe('signed-out'));
  });

  it('reports a server without an encryption key', async () => {
    serve({
      [LIST_PATH]: new ApiError(503, 'Profile encryption is not configured', {
        error: 'Profile encryption is not configured',
        code: ENCRYPTION_NOT_CONFIGURED,
      }),
    });

    const { result } = renderHook(() => useLivingPhases());

    await waitFor(() => expect(result.current.status).toBe('encryption-unavailable'));
    expect(result.current.message).toContain('encryption');
  });

  it('shows an error, and recovers when loading is retried', async () => {
    serve({ [TIMELINE_PATH]: new TypeError('Failed to fetch') });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.message).toContain('Could not reach the server');

    serve();
    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.message).toBeNull();
  });
});

describe('useLivingPhases changes', () => {
  it('creates a phase and then loads fresh data', async () => {
    serve({ [`POST ${LIST_PATH}`]: { id: 'p2' } });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(listLoads()).toBe(1);

    let outcome: Awaited<ReturnType<typeof result.current.createPhase>> | undefined;
    await act(async () => {
      outcome = await result.current.createPhase(newPhase);
    });

    expect(outcome).toEqual({ ok: true, value: { id: 'p2' } });
    const post = apiRequest.mock.calls.find(([, , options]) => options?.method === 'POST');
    expect(post?.[2]?.body).toEqual(newPhase);
    await waitFor(() => expect(listLoads()).toBe(2));
  });

  it('hands an overlap back to the caller without disturbing the screen', async () => {
    serve({
      [`POST ${LIST_PATH}`]: new ApiError(409, 'Phases overlap', { error: 'Phases overlap', conflictingPhaseIds: ['p1'] }),
    });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let outcome: Awaited<ReturnType<typeof result.current.createPhase>> | undefined;
    await act(async () => {
      outcome = await result.current.createPhase(newPhase);
    });

    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'overlap', conflictingPhaseIds: ['p1'] } });
    expect(result.current.status).toBe('ready');
    expect(listLoads()).toBe(1);
  });

  it('flips to signed-out when a change is refused for lack of a session', async () => {
    serve({ [`POST ${LIST_PATH}`]: new ApiError(403, 'Invalid or expired token', null) });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.createPhase(newPhase);
    });

    expect(result.current.status).toBe('signed-out');
  });

  it('sends phase and cost changes to the right endpoints', async () => {
    serve({ [`POST ${LIST_PATH}/p1/fixed-costs`]: { id: 'c9' } });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.updatePhase('p1', { incomeStreams: [] });
      await result.current.deletePhase('p1');
      await result.current.addFixedCost('p1', { category: 'WATER', cadence: 'BIMONTHLY', amountMinor: 4200 });
      await result.current.updateFixedCost('p1', 'c1', { amountMinor: 125000 });
      await result.current.deleteFixedCost('p1', 'c1');
    });

    expect(apiCommand.mock.calls).toEqual([
      [`${LIST_PATH}/p1`, { method: 'PATCH', body: { incomeStreams: [] } }],
      [`${LIST_PATH}/p1`, { method: 'DELETE' }],
      [`${LIST_PATH}/p1/fixed-costs/c1`, { method: 'PATCH', body: { amountMinor: 125000 } }],
      [`${LIST_PATH}/p1/fixed-costs/c1`, { method: 'DELETE' }],
    ]);
    const cost = apiRequest.mock.calls.find(([path, , options]) => path === `${LIST_PATH}/p1/fixed-costs` && options?.method === 'POST');
    expect(cost?.[2]?.body).toEqual({ category: 'WATER', cadence: 'BIMONTHLY', amountMinor: 4200 });
  });

  it('encodes ids that are not URL-safe', async () => {
    serve();
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.deletePhase('a/b');
    });

    expect(apiCommand).toHaveBeenCalledWith(`${LIST_PATH}/a%2Fb`, { method: 'DELETE' });
  });
});

describe('useLivingPhases compare', () => {
  it('asks the server for the comparison without reloading the lists', async () => {
    const comparison = {
      comparable: true,
      fromPhaseId: 'p1',
      toPhaseId: 'p2',
      currency: 'EUR',
      monthlyIncomeDeltaMinor: 0,
      monthlyFixedCostsDeltaMinor: 25000,
      savingsCapacityDeltaMinor: -25000,
      fixedCostsDeltaFraction: 0.1,
      categories: [],
    };
    serve({ [`${LIST_PATH}/compare`]: comparison });
    const { result } = renderHook(() => useLivingPhases());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let outcome: Awaited<ReturnType<typeof result.current.compare>> | undefined;
    await act(async () => {
      outcome = await result.current.compare('p1', 'p2');
    });

    expect(outcome).toEqual({ ok: true, value: comparison });
    expect(apiRequest.mock.calls.at(-1)?.[0]).toBe(`${LIST_PATH}/compare?from=p1&to=p2`);
    expect(listLoads()).toBe(1);
  });
});
