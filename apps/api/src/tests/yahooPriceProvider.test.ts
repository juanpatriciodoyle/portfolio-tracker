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

  describe('stale while revalidate', () => {
    type Quote = { price: number; currency: string } | null;
    const eur = (price: number): Quote => ({ price, currency: 'EUR' });

    /** A lookup the test settles by hand, so it can look at what the caller got while it was still running. */
    function deferredLookups() {
      const pending: Array<(quote: Quote) => void> = [];
      let calls = 0;
      const fetchQuote = () => {
        calls++;
        return new Promise<Quote>((resolve) => pending.push(resolve));
      };
      return { fetchQuote, settle: (quote: Quote) => pending.shift()!(quote), calls: () => calls };
    }
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    it('answers at once with the last price when it is older than five minutes, and refreshes it behind', async () => {
      let clock = 0;
      const lookups = deferredLookups();
      const provider = new YahooPriceProvider(lookups.fetchQuote, () => clock);

      const first = provider.pricesFor(['A'], 'EUR');
      lookups.settle(eur(10));
      await first;

      clock += 6 * 60_000;
      const prices = await provider.pricesFor(['A'], 'EUR');
      expect(prices.get('A')).toBe(10);
      expect(lookups.calls()).toBe(2);

      lookups.settle(eur(12));
      await flush();
      expect((await provider.pricesFor(['A'], 'EUR')).get('A')).toBe(12);
      expect(lookups.calls()).toBe(2);
    });

    it('waits for a fresh price once the last one is older than thirty minutes', async () => {
      let clock = 0;
      const lookups = deferredLookups();
      const provider = new YahooPriceProvider(lookups.fetchQuote, () => clock);
      const first = provider.pricesFor(['A'], 'EUR');
      lookups.settle(eur(10));
      await first;

      clock += 31 * 60_000;
      let answered = false;
      const waiting = provider.pricesFor(['A'], 'EUR').then((prices) => ((answered = true), prices));
      await flush();
      expect(answered).toBe(false);

      lookups.settle(eur(15));
      expect((await waiting).get('A')).toBe(15);
    });

    it('keeps the last price when the refresh behind it fails, and tries again on the next request', async () => {
      let clock = 0;
      const lookups = deferredLookups();
      const provider = new YahooPriceProvider(lookups.fetchQuote, () => clock);
      const first = provider.pricesFor(['A'], 'EUR');
      lookups.settle(eur(10));
      await first;

      clock += 6 * 60_000;
      await provider.pricesFor(['A'], 'EUR');
      lookups.settle(null);
      await flush();

      expect((await provider.pricesFor(['A'], 'EUR')).get('A')).toBe(10);
      expect(lookups.calls()).toBe(3);
    });

    it('treats a lookup that throws as an outage: no price, nothing remembered, no crash', async () => {
      const provider = new YahooPriceProvider(async () => {
        throw new Error('network down');
      });
      expect((await provider.pricesFor(['A'], 'EUR')).size).toBe(0);
    });

    it('shares one lookup between requests that ask for the same symbol at the same time', async () => {
      const lookups = deferredLookups();
      const provider = new YahooPriceProvider(lookups.fetchQuote, () => 0);

      const together = Promise.all([provider.pricesFor(['A'], 'EUR'), provider.pricesFor(['A', 'a'], 'EUR')]);
      await flush();
      expect(lookups.calls()).toBe(1);
      lookups.settle(eur(7));

      const [one, two] = await together;
      expect(one.get('A')).toBe(7);
      expect(two.get('A')).toBe(7);
    });
  });
});
