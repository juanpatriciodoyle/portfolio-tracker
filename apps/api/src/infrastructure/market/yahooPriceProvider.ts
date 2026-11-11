import type { PriceProvider } from '../../application/ports';
import { fetchLiveQuote } from '../../lib/financialFetcher';
import { REFERENCE_EUR_RATES } from '../fx/referenceFxRates';

const CACHE_MILLISECONDS = 5 * 60 * 1000;

type Quote = { price: number; currency: string } | null;

/** Prices for open positions from Yahoo Finance, converted to the person's currency and kept for five minutes. */
export class YahooPriceProvider implements PriceProvider {
  private readonly cache = new Map<string, { quote: Quote; at: number }>();

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

  private async quoteOf(symbol: string): Promise<Quote> {
    const cached = this.cache.get(symbol);
    if (cached && this.now() - cached.at < CACHE_MILLISECONDS) return cached.quote;
    const quote = await this.fetchQuote(symbol);
    // An outage is not remembered: the next request asks again.
    if (quote) this.cache.set(symbol, { quote, at: this.now() });
    return quote;
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
