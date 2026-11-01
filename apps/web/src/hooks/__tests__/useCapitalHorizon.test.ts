import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeCapitalHorizon, makePacedMilestone } from '../../test/fixtures';
import { useCapitalHorizon } from '../useCapitalHorizon';

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
});

describe('useCapitalHorizon', () => {
  it('waits until it is enabled before asking the server', async () => {
    apiRequest.mockResolvedValue(makeCapitalHorizon());
    const { result, rerender } = renderHook(({ enabled }) => useCapitalHorizon(enabled, 0), { initialProps: { enabled: false } });
    expect(apiRequest).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(apiRequest).toHaveBeenCalledWith('/api/insights/capital-horizon', expect.anything());
    expect(result.current.capitalHorizon?.milestones).toHaveLength(1);
  });

  it('asks again when the portfolio value changes', async () => {
    apiRequest.mockResolvedValueOnce(makeCapitalHorizon()).mockResolvedValueOnce(makeCapitalHorizon({ liquidPortfolioMinor: 9_000_000 }));
    const { result, rerender } = renderHook(({ version }) => useCapitalHorizon(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.capitalHorizon?.liquidPortfolioMinor).toBe(8_000_000));

    rerender({ version: 2 });
    await waitFor(() => expect(result.current.capitalHorizon?.liquidPortfolioMinor).toBe(9_000_000));
  });

  it('saves the whole list of goals, then loads the new pace', async () => {
    apiRequest.mockResolvedValueOnce(makeCapitalHorizon({ milestones: [] })).mockResolvedValueOnce(makeCapitalHorizon());
    apiCommand.mockResolvedValue();
    const { result } = renderHook(() => useCapitalHorizon(true, 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const { id, title, targetAmountMinor, capitalRequiredPercentage, category, enabled } = makePacedMilestone();
    const goal = { id, title, targetAmountMinor, capitalRequiredPercentage, category, enabled };
    let saved;
    await act(async () => {
      saved = await result.current.save([goal]);
    });

    expect(saved).toEqual({ ok: true, value: undefined });
    expect(apiCommand).toHaveBeenCalledWith('/api/profile/capital-milestones', { method: 'PUT', body: { milestones: [goal] } });
    await waitFor(() => expect(result.current.capitalHorizon?.milestones).toHaveLength(1));
  });

  it('reports a failed save without losing what is on screen', async () => {
    apiRequest.mockResolvedValue(makeCapitalHorizon());
    apiCommand.mockRejectedValue(new ApiError(500, 'Server error', null));
    const { result } = renderHook(() => useCapitalHorizon(true, 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let saved;
    await act(async () => {
      saved = await result.current.save([]);
    });

    expect(saved).toMatchObject({ ok: false });
    expect(result.current.capitalHorizon?.milestones).toHaveLength(1);
  });
});
