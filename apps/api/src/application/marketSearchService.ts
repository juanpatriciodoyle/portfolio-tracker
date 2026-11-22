import type { TickerMatch, TickerSearch } from './ports';

/** Fewer characters match too much to be useful, and would make the market work for nothing. */
export const MIN_TICKER_QUERY_LENGTH = 3;

export interface MarketSearchServiceDeps {
  readonly tickers: TickerSearch;
}

/** Looking up an instrument by the few letters a person has typed so far. */
export class MarketSearchService {
  private readonly tickers: TickerSearch;

  constructor({ tickers }: MarketSearchServiceDeps) {
    this.tickers = tickers;
  }

  async search(query: string): Promise<readonly TickerMatch[]> {
    const wanted = query.trim();
    if (wanted.length < MIN_TICKER_QUERY_LENGTH) return [];
    return this.tickers.search(wanted);
  }
}
