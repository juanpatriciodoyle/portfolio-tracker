import type { PortfolioValueReader } from '../application/ports';
import type { PortfolioService } from '../application/portfolioService';

/** Reads the portfolio's net worth (cash plus open positions at market prices) from the portfolio use cases, in the person's base currency. */
export class PnlPortfolioValueReader implements PortfolioValueReader {
  constructor(private readonly portfolio: Pick<PortfolioService, 'overview'>) {}

  async netWorth(userId: string) {
    const { netWorth, baseCurrency } = await this.portfolio.overview(userId);
    return { amountMinor: Math.round(netWorth * 100), currency: baseCurrency };
  }
}
