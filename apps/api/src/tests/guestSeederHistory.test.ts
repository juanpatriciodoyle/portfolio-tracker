import { DemoGuestSeeder, type DemoHistorySeeding } from '../application/guestSeeder';
import type { PriceProvider } from '../application/ports';
import { DEMO_REFERENCE_INDEX, DEMO_REFERENCE_PRICES } from '../domain/demoPortfolio';
import { WORLD_INDEX_SYMBOL } from '../domain/portfolioSnapshots';
import { REFERENCE_EUR_RATES } from '../infrastructure/fx/referenceFxRates';
import { InMemorySnapshotRepository } from './support/inMemoryPortfolio';

const TODAY = '2026-11-23';

function build(prices: PriceProvider, options: { timeoutMs?: number } = {}) {
  const snapshots = new InMemorySnapshotRepository();
  const history: DemoHistorySeeding = { snapshots, prices, eurValue: REFERENCE_EUR_RATES, priceTimeoutMs: options.timeoutMs ?? 1000 };
  const seeder = new DemoGuestSeeder({ portfolio: { write: async () => undefined }, profile: null, history, today: () => TODAY });
  return { seeder, snapshots };
}

const answering = (quotes: Record<string, number>): PriceProvider => ({
  pricesFor: async (symbols) => new Map(symbols.flatMap((symbol) => (quotes[symbol] === undefined ? [] : [[symbol.toUpperCase(), quotes[symbol]] as [string, number]]))),
});

describe('seeding the demo history of a guest', () => {
  it('gives the guest a history from the first demo transaction to yesterday, never today', async () => {
    const { seeder, snapshots } = build(answering({}));
    await seeder.seed('guest-1');

    const days = (await snapshots.list('guest-1')).map((snapshot) => snapshot.day).sort();
    expect(days[0]).toBe('2020-01-05');
    expect(days[days.length - 1]).toBe('2026-11-22');
    expect(days.length).toBeGreaterThan(300);
  });

  it('ends the history at today’s market prices when they can be read', async () => {
    const { seeder, snapshots } = build(answering({ AAPL: 400, [WORLD_INDEX_SYMBOL]: 150 }));
    await seeder.seed('guest-1');

    const last = (await snapshots.list('guest-1')).sort((a, b) => a.day.localeCompare(b.day)).pop()!;
    expect(last.benchmarkPrice).toBeCloseTo(150, 2);

    const withReference = build(answering({}));
    await withReference.seeder.seed('guest-2');
    const base = (await withReference.snapshots.list('guest-2')).sort((a, b) => a.day.localeCompare(b.day)).pop()!;
    // 230 shares of Apple at 400 instead of the reference price.
    expect(last.holdingsValue - base.holdingsValue).toBeCloseTo(230 * (400 - DEMO_REFERENCE_PRICES.AAPL), 0);
  });

  it('falls back to the demo’s own reference prices when the market cannot be read, and still seeds', async () => {
    const { seeder, snapshots } = build({ pricesFor: async () => Promise.reject(new Error('offline')) });
    await expect(seeder.seed('guest-1')).resolves.toBeUndefined();

    const last = (await snapshots.list('guest-1')).sort((a, b) => a.day.localeCompare(b.day)).pop()!;
    expect(last.benchmarkPrice).toBeCloseTo(DEMO_REFERENCE_INDEX.endPrice, 2);
    expect(last.holdingsValue).toBeGreaterThan(0);
  });

  it('does not keep the guest waiting for a market that never answers', async () => {
    const { seeder, snapshots } = build({ pricesFor: () => new Promise(() => undefined) }, { timeoutMs: 20 });
    await expect(seeder.seed('guest-1')).resolves.toBeUndefined();
    expect((await snapshots.list('guest-1')).length).toBeGreaterThan(300);
  });

  it('ignores a nonsense price and keeps the reference one', async () => {
    const { seeder, snapshots } = build(answering({ AAPL: Number.NaN, NVDA: -5, [WORLD_INDEX_SYMBOL]: 0 }));
    await seeder.seed('guest-1');
    const last = (await snapshots.list('guest-1')).sort((a, b) => a.day.localeCompare(b.day)).pop()!;
    expect(Number.isFinite(last.totalValue)).toBe(true);
    expect(last.benchmarkPrice).toBeCloseTo(DEMO_REFERENCE_INDEX.endPrice, 2);
  });

  it('keeps every guest’s history their own', async () => {
    const { seeder, snapshots } = build(answering({}));
    await seeder.seed('guest-1');
    await seeder.seed('guest-2');
    expect((await snapshots.list('guest-1')).length).toBe((await snapshots.list('guest-2')).length);
    expect((await snapshots.list('guest-3')).length).toBe(0);
  });

  it('seeds no history when none is asked for', async () => {
    const snapshots = new InMemorySnapshotRepository();
    const seeder = new DemoGuestSeeder({ portfolio: { write: async () => undefined }, profile: null, today: () => TODAY });
    await seeder.seed('guest-1');
    expect(await snapshots.list('guest-1')).toEqual([]);
  });
});
