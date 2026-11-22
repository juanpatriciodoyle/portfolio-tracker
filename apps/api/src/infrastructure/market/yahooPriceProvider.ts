import type { PriceProvider } from '../../application/ports';
import { fetchLiveQuote } from '../../lib/financialFetcher';
import { REFERENCE_EUR_RATES } from '../fx/referenceFxRates';

/** A price this young is used as it is. */
const FRESH_MILLISECONDS = 5 * 60 * 1000;
/** A price this young may still be shown while a newer one is fetched behind the request. Older, the request waits. */
const STALE_MILLISECONDS = 30 * 60 * 1000;

type Quote = { price: number; currency: string } | null;

/**
 * Prices for open positions from Yahoo Finance, converted to the person's currency. A price is fresh for five
 * minutes; for the next twenty-five it is still shown at once while a new one is fetched behind the request, so
 * opening the dashboard never waits on Yahoo once a price has been seen. Requests for the same symbol share one lookup.
 */
export class YahooPriceProvider implements PriceProvider {
  private readonly cache = new Map<string, { quote: Quote; at: number }>();
  private readonly lookups = new Map<string, Promise<Quote>>();

  constructor(
    private readonly fetchQuote: (symbol: string) => Promise<Quote> = fetchLiveQuote,
    private readonly now: () => number = Date.now
  ) {}

  async pricesFor(symbols: readonly string[], currency: string): Promise<ReadonlyMap<string, number>> {
    const quotes = await Promise.all([...new Set(symbols.map((s) => s.toUpperCase()))].map(async (symbol) => [symbol, await this.quoteOf(symbol)] as const));
    const prices = new Map<string, number>();
    for (const [symbol, quote] of quotes) {
      const converted = quote && convert(quote, currency);
      if (converted !== null && converted !== undefined) prices.set(symbol, converted);
    }
    return prices;
  }

  private quoteOf(symbol: string): Promise<Quote> {
    const cached = this.cache.get(symbol);
    const age = cached ? this.now() - cached.at : Number.POSITIVE_INFINITY;
    if (cached && age < FRESH_MILLISECONDS) return Promise.resolve(cached.quote);
    if (cached && age < STALE_MILLISECONDS) {
      void this.lookup(symbol);
      return Promise.resolve(cached.quote);
    }
    return this.lookup(symbol);
  }

  /** One lookup per symbol at a time. An outage, or a lookup that throws, is no answer and is not remembered. */
  private lookup(symbol: string): Promise<Quote> {
    const running = this.lookups.get(symbol);
    if (running) return running;

    const started = this.fetchQuote(symbol)
      .catch((): Quote => null)
      .then((quote) => {
        if (quote) this.cache.set(symbol, { quote, at: this.now() });
        return quote;
      })
      .finally(() => this.lookups.delete(symbol));
    this.lookups.set(symbol, started);
    return started;
  }
}

/** London quotes come in pence (GBp). A currency without a known rate gives no price rather than a wrong one. */
function convert(quote: { price: number; currency: string }, target: string): number | null {
  const [unit, divisor] = quote.currency === 'GBp' ? (['GBP', 100] as const) : ([quote.currency.toUpperCase(), 1] as const);
  const rates = REFERENCE_EUR_RATES as Record<string, number>;
  const from = rates[unit];
  const to = rates[target.toUpperCase()];
  if (!from || !to) return null;
  return (quote.price / divisor) * (from / to);
}
