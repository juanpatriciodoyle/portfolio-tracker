import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as http from '../../lib/authorizedFetch';
import { clearPortfolioCache, usePortfolio } from '../usePortfolio';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn(), readAuthToken: vi.fn() }));

const readAuthToken = http.readAuthToken as unknown as Mock<() => string | null>;

const authorizedFetch = http.authorizedFetch as unknown as Mock<(path: string) => Promise<Response>>;

const stats = { netWorth: 1000, cashBalance: 100, country: 'Spain', baseCurrency: 'EUR', positions: [], soldAssets: [] };
const point = (value: number) => ({ date_time: '2026-01-01T00:00:00.000Z', portfolio_value_in_reporting_currency: value });

const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body } as Response);

/** Answers each endpoint from the maps, so a test can change what the server says between loads. */
function serve(responses: { stats?: () => Promise<Response>; history?: () => Promise<Response> } = {}) {
  authorizedFetch.mockImplementation((path) => {
    if (path === '/api/portfolio/stats') return (responses.stats ?? (() => answer(stats)))();
    if (path === '/api/portfolio/history') return (responses.history ?? (() => answer([point(1000)])))();
    throw new Error(`unexpected request ${path}`);
  });
}

beforeEach(() => {
  clearPortfolioCache();
  readAuthToken.mockReset();
  readAuthToken.mockReturnValue('token-a');
  authorizedFetch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('usePortfolio', () => {
  it('asks nothing while nobody is signed in', () => {
    serve();
    const { result } = renderHook(() => usePortfolio(false));

    expect(authorizedFetch).not.toHaveBeenCalled();
    expect(result.current.hasLoaded).toBe(false);
    expect(result.current.stats.netWorth).toBe(0);
  });

  it('loads the figures and the value history, then says it has loaded', async () => {
    serve();
    const { result } = renderHook(() => usePortfolio(true));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.stats.netWorth).toBe(1000);
    expect(result.current.history).toHaveLength(1);
  });

  it('keeps the empty figures and still says it has loaded when the server refuses', async () => {
    serve({ stats: () => answer({}, false), history: () => answer([], false) });
    const { result } = renderHook(() => usePortfolio(true));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.stats.netWorth).toBe(0);
    expect(result.current.stats.baseCurrency).toBe('EUR');
    expect(result.current.history).toEqual([]);
  });

  it('keeps the empty figures and still says it has loaded when the network fails', async () => {
    authorizedFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePortfolio(true));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.stats.netWorth).toBe(0);
  });

  it('loads again on refresh, with what the server says now', async () => {
    serve();
    const { result } = renderHook(() => usePortfolio(true));
    await waitFor(() => expect(result.current.stats.netWorth).toBe(1000));

    serve({ stats: () => answer({ ...stats, netWorth: 2500 }) });
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.stats.netWorth).toBe(2500));
  });

  it('shows the chosen country at once and then loads what the server computed for it', async () => {
    serve();
    const { result } = renderHook(() => usePortfolio(true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    serve({ stats: () => answer({ ...stats, country: 'Argentina', annualInflationRate: 40 }) });
    act(() => result.current.applyCountry('Argentina', 41.5));
    expect(result.current.stats.country).toBe('Argentina');
    expect(result.current.stats.annualInflationRate).toBe(41.5);

    await waitFor(() => expect(result.current.stats.annualInflationRate).toBe(40));
  });

  describe('remembering the last answer', () => {
    it('shows the last answer at once when the person comes back, and says it came from memory', async () => {
      serve();
      const first = renderHook(() => usePortfolio(true));
      await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
      first.unmount();

      serve({ stats: () => new Promise<Response>(() => undefined) });
      const back = renderHook(() => usePortfolio(true));

      expect(back.result.current.hasLoaded).toBe(true);
      expect(back.result.current.stats.netWorth).toBe(1000);
      expect(back.result.current.history).toHaveLength(1);
      expect(back.result.current.fromMemory).toBe(true);
    });

    it('still asks the server and replaces what it showed with what it answers', async () => {
      serve();
      const first = renderHook(() => usePortfolio(true));
      await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
      first.unmount();

      serve({ stats: () => answer({ ...stats, netWorth: 1500 }) });
      const back = renderHook(() => usePortfolio(true));

      await waitFor(() => expect(back.result.current.stats.netWorth).toBe(1500));
      expect(authorizedFetch).toHaveBeenCalledWith('/api/portfolio/stats');
    });

    it('is not from memory the first time', async () => {
      serve();
      const { result } = renderHook(() => usePortfolio(true));
      expect(result.current.fromMemory).toBe(false);
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    });

    it('never shows one person the figures of another', async () => {
      serve();
      const first = renderHook(() => usePortfolio(true));
      await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
      first.unmount();

      readAuthToken.mockReturnValue('token-b');
      serve({ stats: () => new Promise<Response>(() => undefined) });
      const other = renderHook(() => usePortfolio(true));

      expect(other.result.current.hasLoaded).toBe(false);
      expect(other.result.current.stats.netWorth).toBe(0);
      expect(other.result.current.fromMemory).toBe(false);
    });

    it('forgets everything on clear, as when signing out', async () => {
      serve();
      const first = renderHook(() => usePortfolio(true));
      await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
      first.unmount();

      clearPortfolioCache();
      serve({ stats: () => new Promise<Response>(() => undefined) });
      const back = renderHook(() => usePortfolio(true));

      expect(back.result.current.hasLoaded).toBe(false);
    });

    it('does not remember a refusal as if it were an answer', async () => {
      serve({ stats: () => answer({}, false), history: () => answer([], false) });
      const first = renderHook(() => usePortfolio(true));
      await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
      first.unmount();

      serve({ stats: () => new Promise<Response>(() => undefined) });
      const back = renderHook(() => usePortfolio(true));
      expect(back.result.current.hasLoaded).toBe(false);
    });
  });
});
