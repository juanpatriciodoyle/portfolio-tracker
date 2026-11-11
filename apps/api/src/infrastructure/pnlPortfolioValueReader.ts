import type { PortfolioValueReader, PriceProvider } from '../application/ports';
import { getPortfolioOverview } from '../lib/pnlEngine';
import { noPrices } from './market/marketPrices';

/** Reads the portfolio's net worth (cash plus open positions at market prices) from the P&L engine, in the person's base currency. */
export class PnlPortfolioValueReader implements PortfolioValueReader {
  constructor(private readonly prices: PriceProvider = noPrices) {}

  async netWorth(userId: string) {
    const { netWorth, baseCurrency } = await getPortfolioOverview(userId, this.prices);
    return { amountMinor: Math.round(netWorth * 100), currency: baseCurrency };
  }
}
