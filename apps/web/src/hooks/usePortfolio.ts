import { useCallback, useEffect, useState } from 'react';
import type { CashBalanceItem } from '../components/CashBalancesTable';
import type { PositionItem, SoldAssetItem } from '../components/HoldingsTable';
import type { ChartDataPoint } from '../data/sampleChartData';
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
  cashBalance: number;
  totalInvested: number;
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
  totalIncome?: number;
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
  totalInvested: 0,
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

interface PortfolioAnswer {
  stats: StatsData | null;
  history: ChartDataPoint[] | null;
}

/** Both reads together; what the server refused or could not deliver comes back as null so the old figures stay. */
async function loadPortfolio(): Promise<PortfolioAnswer> {
  try {
    const [statsResponse, historyResponse] = await Promise.all([
      authorizedFetch('/api/portfolio/stats'),
      authorizedFetch('/api/portfolio/history'),
    ]);
    return {
      stats: statsResponse.ok ? ((await statsResponse.json()) as StatsData) : null,
      history: historyResponse.ok ? ((await historyResponse.json()) as ChartDataPoint[]) : null,
    };
  } catch (err) {
    console.error('Failed to fetch portfolio data:', err);
    return { stats: null, history: null };
  }
}

/** The last good answer of this session, so coming back to the dashboard shows figures at once while fresh ones load. */
const remembered = createPortfolioCache<{ stats: StatsData; history: ChartDataPoint[] }>();

/** Forget every remembered answer: signing out must leave no one's figures behind. */
export function clearPortfolioCache(): void {
  remembered.clear();
}

/**
 * The portfolio's figures and its value history for the person signed in. Loads once `enabled`, and again on
 * `refresh()` (after a transaction). `hasLoaded` turns true after the first answer, good or not, or at once when the
 * last answer of this session is remembered (`fromMemory`): those figures stay until the server's own replace them.
 */
export function usePortfolio(enabled: boolean) {
  const [initial] = useState(() => (enabled ? remembered.read(readAuthToken(), Date.now()) : null));
  const [stats, setStats] = useState<StatsData>(initial?.stats ?? EMPTY_STATS);
  const [history, setHistory] = useState<ChartDataPoint[]>(initial?.history ?? []);
  const [hasLoaded, setHasLoaded] = useState(initial !== null);
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
      setHasLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  /** Shows the country and rate just chosen straight away, then loads what the server computed with them. */
  const applyCountry = useCallback(
    (country: string, annualInflationRate: number) => {
      setStats((previous) => ({ ...previous, country, annualInflationRate }));
      refresh();
    },
    [refresh],
  );

  return { stats, history, hasLoaded, fromMemory: initial !== null, refresh, applyCountry };
}
