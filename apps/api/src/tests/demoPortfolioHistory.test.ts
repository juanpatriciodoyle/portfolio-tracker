import { PortfolioService } from '../application/portfolioService';
import type { PriceProvider } from '../application/ports';
import { REFERENCE_EUR_RATES } from '../infrastructure/fx/referenceFxRates';
import { demoSnapshotHistory } from '../domain/demoHistory';
import { DEMO_CURRENCY, DEMO_LEDGER, DEMO_POSITIONS, DEMO_REFERENCE_INDEX, DEMO_REFERENCE_PRICES } from '../domain/demoPortfolio';
import { WORLD_INDEX_SYMBOL } from '../domain/portfolioSnapshots';
import { flatInflation, InMemoryPortfolioRepository, InMemorySnapshotRepository } from './support/inMemoryPortfolio';

describe('the demo portfolio is one story', () => {
  it('has each open position equal to what its purchases add up to', () => {
    for (const position of DEMO_POSITIONS) {
      const buys = DEMO_LEDGER.filter((entry) => entry.type === 'BOUGHT' && entry.symbol === position.symbol);
      expect(buys.reduce((sum, entry) => sum + entry.quantity, 0)).toBeCloseTo(position.quantity, 9);
      expect(buys.reduce((sum, entry) => sum + entry.amount, 0)).toBeCloseTo(position.investedAmount, 6);
    }
  });

  it('has every purchase in an open position, and a reference price for each', () => {
    const bought = new Set(DEMO_LEDGER.filter((entry) => entry.type === 'BOUGHT').map((entry) => entry.symbol));
    expect([...bought].sort()).toEqual(DEMO_POSITIONS.map((position) => position.symbol).sort());
    for (const symbol of bought) expect(DEMO_REFERENCE_PRICES[symbol]).toBeGreaterThan(0);
  });
});

describe('the demo history agrees with the live figures', () => {
  const GUEST = 'guest';
  const TODAY = new Date('2026-11-24T10:00:00Z');

  async function liveAndHistory() {
    const repository = new InMemoryPortfolioRepository();
    repository.addOwner({ id: GUEST, country: 'Spain', baseCurrency: DEMO_CURRENCY });
    const quotes: Record<string, number> = { ...DEMO_REFERENCE_PRICES, [WORLD_INDEX_SYMBOL]: DEMO_REFERENCE_INDEX.endPrice };
    const prices: PriceProvider = { pricesFor: async (symbols) => new Map(symbols.flatMap((symbol) => (quotes[symbol] === undefined ? [] : [[symbol.toUpperCase(), quotes[symbol]] as [string, number]]))) };
    const service = new PortfolioService({
      repository,
      snapshots: new InMemorySnapshotRepository(),
      prices,
      inflation: flatInflation(0),
      eurValue: REFERENCE_EUR_RATES,
      now: () => TODAY,
    });
    for (const entry of DEMO_LEDGER) {
      await service.recordTransaction({
        userId: GUEST,
        type: entry.type,
        symbol: entry.symbol,
        name: entry.name,
        assetClass: entry.assetClass,
        region: entry.region,
        sector: entry.sector,
        quantity: entry.quantity,
        amount: entry.amount,
        fee: entry.fee,
        currency: entry.currency,
        date: entry.date.toISOString(),
        paidWithCash: entry.paidWithCash,
      });
    }
    const overview = await service.overview(GUEST);
    const seeded = demoSnapshotHistory({
      ledger: DEMO_LEDGER,
      currency: DEMO_CURRENCY,
      eurValue: REFERENCE_EUR_RATES,
      endDay: '2026-11-23',
      endPrices: DEMO_REFERENCE_PRICES,
      indexEndPrice: DEMO_REFERENCE_INDEX.endPrice,
    });
    return { overview, seeded, history: await service.history(GUEST) };
  }

  it('ends on the same net worth, cash and money put in as the hero', async () => {
    const { overview, seeded } = await liveAndHistory();
    const last = seeded[seeded.length - 1];
    expect(last.totalValue).toBeCloseTo(overview.netWorth, 1);
    expect(last.cash).toBeCloseTo(overview.cashBalance, 1);
    expect(last.moneyPutIn).toBeCloseTo(overview.moneyPutIn, 1);
    expect(last.holdingsValue).toBeCloseTo(overview.openMarketValue, 1);
  });

  it('keeps cash from ever being negative along the way', () => {
    const seeded = demoSnapshotHistory({
      ledger: DEMO_LEDGER,
      currency: DEMO_CURRENCY,
      eurValue: REFERENCE_EUR_RATES,
      endDay: '2026-11-23',
      endPrices: DEMO_REFERENCE_PRICES,
      indexEndPrice: DEMO_REFERENCE_INDEX.endPrice,
    });
    expect(Math.min(...seeded.map((snapshot) => snapshot.cash))).toBeGreaterThanOrEqual(0);
  });
});
