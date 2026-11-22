import { MarketSearchService, MIN_TICKER_QUERY_LENGTH } from '../application/marketSearchService';
import type { TickerMatch } from '../application/ports';

const apple: TickerMatch = { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', sector: 'Technology' };

function build(matches: readonly TickerMatch[] = [apple]) {
  const asked: string[] = [];
  const service = new MarketSearchService({
    tickers: {
      search: async (query) => {
        asked.push(query);
        return matches;
      },
    },
  });
  return { service, asked };
}

describe('MarketSearchService', () => {
  it('needs at least three characters before it asks the market', async () => {
    const { service, asked } = build();

    expect(MIN_TICKER_QUERY_LENGTH).toBe(3);
    expect(await service.search('')).toEqual([]);
    expect(await service.search('AA')).toEqual([]);
    expect(await service.search('  A  ')).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('asks once there are three characters, ignoring the spaces around them', async () => {
    const { service, asked } = build();

    expect(await service.search('  AAP ')).toEqual([apple]);
    expect(asked).toEqual(['AAP']);
  });

  it('lets a failing market propagate: the caller decides what to tell the person', async () => {
    const service = new MarketSearchService({
      tickers: {
        search: async () => {
          throw new Error('offline');
        },
      },
    });

    await expect(service.search('AAPL')).rejects.toThrow('offline');
  });
});
