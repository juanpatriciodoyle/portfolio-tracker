import { useCallback, useEffect, useState } from 'react';
import type { CashBalanceItem } from '../components/CashBalancesTable';
import type { PositionItem, SoldAssetItem } from '../components/HoldingsTable';
import { portfolioHistoryResponse, type PortfolioHistoryResponse } from '../contracts';
import { authorizedFetch, readAuthToken } from '../lib/authorizedFetch';
import { createPortfolioCache } from '../lib/portfolioCache';

export interface BreakdownItem {
  name: string;
  amount: number;
  percentage: number;
}

/** What `GET /api/portfolio/stats` answers: the figures of the whole portfolio, already computed by the API. */
export interface StatsData {
  netWorth: number;
  realNetWorth: number;
  /** All the cash the person holds, as one figure; the cash pills below add up to it. */
  cashBalance: number;
  /** Money put in minus money taken out. Dividends and cash a purchase drew on are not counted. */
  moneyPutIn: number;
  openInvestedValue: number;
  openMarketValue: number;
  soldProfit: number;
  openProfit: number;
  realSoldProfit: number;
  realOpenProfit: number;
  dividends: number;
  pricesAvailable: boolean;
  totalProfit: number;
  totalFees?: number;
  allTimeRoiPercent: number;
  realProfitEuros: number;
  realRoiPercent: number;
  annualInflationRate?: number;
  country: string;
  baseCurrency: string;
  breakdowns: {
    regions: BreakdownItem[];
    sectors: BreakdownItem[];
    assetClasses: BreakdownItem[];
  };
  positions: PositionItem[];
  soldAssets: SoldAssetItem[];
  cashBalances?: CashBalanceItem[];
}

/** What an account with nothing in it shows, and what stays on screen if the server cannot be reached. */
const EMPTY_STATS: StatsData = {
  netWorth: 0,
  realNetWorth: 0,
  cashBalance: 0,
  moneyPutIn: 0,
  openInvestedValue: 0,
  openMarketValue: 0,
  openProfit: 0,
  realSoldProfit: 0,
  realOpenProfit: 0,
  dividends: 0,
  pricesAvailable: true,
  soldProfit: 0,
  totalProfit: 0,
  allTimeRoiPercent: 0,
  realProfitEuros: 0,
  realRoiPercent: 0,
  country: 'Spain',
  baseCurrency: 'EUR',
  breakdowns: { regions: [], sectors: [], assetClasses: [] },
  positions: [],
  soldAssets: [],
};

/** What an account with no readings shows: the chart says its line starts today. */
const NO_HISTORY: PortfolioHistoryResponse = { realFrom: null, points: [] };

interface PortfolioAnswer {
  stats: StatsData | null;
  history: PortfolioHistoryResponse | null;
}

/** Both reads together; what the server refused or could not deliver comes back as null so the old figures stay. */
async function loadPortfolio(): Promise<PortfolioAnswer> {
  try {
    const [statsResponse, historyResponse] = await Promise.all([
      authorizedFetch('/api/portfolio/stats'),
      authorizedFetch('/api/portfolio/history'),
    ]);
    // The history crosses the boundary through its contract; an answer that does not match it is treated as no answer.
    const history = historyResponse.ok ? portfolioHistoryResponse.safeParse(await historyResponse.json()) : null;
    return {
      stats: statsResponse.ok ? ((await statsResponse.json()) as StatsData) : null,
      history: history?.success ? history.data : null,
    };
  } catch (err) {
    console.error('Failed to fetch portfolio data:', err);
    return { stats: null, history: null };
  }
}

/** The last good answer of this session, so coming back to the dashboard shows figures at once while fresh ones load. */
const remembered = createPortfolioCache<{ stats: StatsData; history: PortfolioHistoryResponse }>();

/** Forget every remembered answer: signing out must leave no one's figures behind. */
export function clearPortfolioCache(): void {
  remembered.clear();
}

/**
 * Where the first answer stands: `loading` until the server has answered, `ready` when it gave both the figures and
 * the history (or the last answer of this session is remembered), `failed` when it could not and there is nothing
 * good to show. The screen must never read "failed" as "an account with nothing in it".
 */
export type PortfolioStatus = 'loading' | 'ready' | 'failed';

/**
 * The portfolio's figures and its value history for the person signed in. Loads once `enabled`, and again on
 * `refresh()` (after a transaction, or to retry after a failure). A remembered answer of this session (`fromMemory`)
 * is `ready` at once and stays until the server's own replace it; a later refresh that fails keeps the last good
 * figures instead of turning the screen into an error.
 */
export function usePortfolio(enabled: boolean) {
  const [initial] = useState(() => (enabled ? remembered.read(readAuthToken(), Date.now()) : null));
  const [stats, setStats] = useState<StatsData>(initial?.stats ?? EMPTY_STATS);
  const [history, setHistory] = useState<PortfolioHistoryResponse>(initial?.history ?? NO_HISTORY);
  const [status, setStatus] = useState<PortfolioStatus>(initial !== null ? 'ready' : 'loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const person = readAuthToken();
      const answer = await loadPortfolio();
      if (cancelled) return;
      if (answer.stats) setStats(answer.stats);
      if (answer.history) setHistory(answer.history);
      if (answer.stats && answer.history) remembered.write(person, { stats: answer.stats, history: answer.history }, Date.now());
      // A complete answer is ready; an incomplete one only fails the screen while there are no good figures behind it.
      setStatus((before) => (answer.stats && answer.history ? 'ready' : before === 'ready' ? 'ready' : 'failed'));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  const refresh = useCallback(() => {
    setStatus((before) => (before === 'failed' ? 'loading' : before));
    setReloadKey((key) => key + 1);
  }, []);

  /** Shows the country and rate just chosen straight away, then loads what the server computed with them. */
  const applyCountry = useCallback(
    (country: string, annualInflationRate: number) => {
      setStats((previous) => ({ ...previous, country, annualInflationRate }));
      refresh();
    },
    [refresh],
  );

  return { stats, history, status, fromMemory: initial !== null, refresh, applyCountry };
}
