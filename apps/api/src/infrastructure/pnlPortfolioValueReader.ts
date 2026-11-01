import type { PortfolioValueReader } from '../application/ports';
import { getPortfolioOverview } from '../lib/pnlEngine';

/** Reads the portfolio's net worth (cash plus open positions) from the P&L engine, in the person's base currency. */
export class PnlPortfolioValueReader implements PortfolioValueReader {
  async netWorth(userId: string) {
    const { netWorth, baseCurrency } = await getPortfolioOverview(userId);
    return { amountMinor: Math.round(netWorth * 100), currency: baseCurrency };
  }
}
