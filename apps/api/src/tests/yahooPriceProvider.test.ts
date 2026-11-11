import { YahooPriceProvider } from '../infrastructure/market/yahooPriceProvider';

describe('YahooPriceProvider', () => {
  it('converts a quote to the person currency', async () => {
    const provider = new YahooPriceProvider(async () => ({ price: 100, currency: 'USD' }));
    const prices = await provider.pricesFor(['aapl'], 'EUR');
    expect(prices.get('AAPL')).toBeCloseTo(86.236, 3);
  });

  it('reads London pence as pounds', async () => {
    const provider = new YahooPriceProvider(async () => ({ price: 1000, currency: 'GBp' }));
    expect((await provider.pricesFor(['VOD.L'], 'GBP')).get('VOD.L')).toBeCloseTo(10, 6);
  });

  it('leaves out a symbol with no answer or an unknown currency', async () => {
    const provider = new YahooPriceProvider(async (s) => (s === 'A' ? null : { price: 5, currency: 'XYZ' }));
    expect((await provider.pricesFor(['A', 'B'], 'EUR')).size).toBe(0);
  });

  it('keeps an answer for five minutes but never remembers an outage', async () => {
    let clock = 0;
    let calls = 0;
    let answer: { price: number; currency: string } | null = null;
    const provider = new YahooPriceProvider(async () => (calls++, answer), () => clock);

    await provider.pricesFor(['A'], 'EUR');
    answer = { price: 10, currency: 'EUR' };
    expect((await provider.pricesFor(['A'], 'EUR')).get('A')).toBe(10);
    clock += 60_000;
    await provider.pricesFor(['A'], 'EUR');
    expect(calls).toBe(2);
    clock += 5 * 60_000;
    await provider.pricesFor(['A'], 'EUR');
    expect(calls).toBe(3);
  });
});
