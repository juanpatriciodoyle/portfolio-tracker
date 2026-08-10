import { searchMarketTickers } from '../lib/financialFetcher';

describe('Live Market Data & Autocomplete Search Engine', () => {
  it('should return empty results for queries shorter than 3 characters', async () => {
    const resultsShort = await searchMarketTickers('VU');
    expect(resultsShort).toEqual([]);
  });

  it('should find European UCITS ETF VUAA.DE when searching VUA', async () => {
    const results = await searchMarketTickers('VUA');
    expect(results.length).toBeGreaterThan(0);

    const vuaaItem = results.find((item) => item.symbol.startsWith('VUAA'));
    expect(vuaaItem).toBeDefined();
    expect(vuaaItem?.assetClass).toBe('ETF');
  });

  it('should find Banco Santander SAN.MC when searching SAN', async () => {
    const results = await searchMarketTickers('SAN');
    expect(results.length).toBeGreaterThan(0);

    const sanItem = results.find((item) => item.symbol === 'SAN.MC');
    expect(sanItem).toBeDefined();
    expect(sanItem?.name).toContain('Santander');
  });

  it('should find Bitcoin BTC-USD when searching BTC', async () => {
    const results = await searchMarketTickers('BTC');
    expect(results.length).toBeGreaterThan(0);

    const btcItem = results.find((item) => item.symbol === 'BTC-USD');
    expect(btcItem).toBeDefined();
    expect(btcItem?.assetClass).toBe('Crypto');
  });

  it('should find Apple AAPL when searching AAP', async () => {
    const results = await searchMarketTickers('AAP');
    expect(results.length).toBeGreaterThan(0);

    const aaplItem = results.find((item) => item.symbol === 'AAPL');
    expect(aaplItem).toBeDefined();
  });
});
