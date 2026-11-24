import type { PortfolioStatus, StatsData } from '../hooks/usePortfolio';

/** An account where nothing was ever logged: home asks for a first transaction instead of drawing figures of zero. */
export function isEmptyAccount(stats: Pick<StatsData, 'positions' | 'soldAssets' | 'cashBalance' | 'netWorth' | 'moneyPutIn'>): boolean {
  return stats.positions.length === 0 && stats.soldAssets.length === 0 && stats.cashBalance === 0 && stats.netWorth === 0 && stats.moneyPutIn === 0;
}

export type HomeView = 'loading' | 'failed' | 'first-transaction' | 'portfolio';

/**
 * Which home the person sees. The empty-account card belongs only to a successful answer with nothing in it: while
 * the server has not answered, or could not, the figures of zero are not an account's truth.
 */
export function homeView(status: PortfolioStatus, stats: Parameters<typeof isEmptyAccount>[0]): HomeView {
  if (status === 'loading') return 'loading';
  if (status === 'failed') return 'failed';
  return isEmptyAccount(stats) ? 'first-transaction' : 'portfolio';
}
