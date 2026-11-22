import YahooFinance from 'yahoo-finance2';
import type { TickerMatch, TickerSearch } from '../application/ports';

/** The two Yahoo calls this module makes, and nothing of the rest: answers are checked before they are trusted. */
interface YahooClient {
  search(query: string, options: { newsCount: number; quotesCount: number }): Promise<unknown>;
  quote(symbol: string): Promise<unknown>;
}
type YahooClientConstructor = new (options: { suppressNotices: string[] }) => YahooClient;

let yfInstance: YahooClient | null = null;
function getYf(): YahooClient {
  if (!yfInstance) {
    try {
      // The library's one-off survey notice would otherwise print in the server log on every start.
      yfInstance = new (YahooFinance as unknown as YahooClientConstructor)({ suppressNotices: ['yahooSurvey'] });
    } catch {
      yfInstance = YahooFinance as unknown as YahooClient;
    }
  }
  return yfInstance;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const nonEmptyText = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** The quotes of a Yahoo search answer, whatever shape the answer has. */
const quotesOf = (answer: unknown): unknown[] => (isRecord(answer) && Array.isArray(answer.quotes) ? answer.quotes : []);

/** Instruments Yahoo knows by name, as the picker shows them. A quote without a symbol or a name is skipped. */
function liveMatchesFrom(quotes: readonly unknown[]): TickerMatch[] {
  return quotes.flatMap((quote): TickerMatch[] => {
    if (!isRecord(quote)) return [];
    const symbol = nonEmptyText(quote.symbol);
    const longName = nonEmptyText(quote.longname);
    const shortName = nonEmptyText(quote.shortname);
    if (!symbol || !(shortName || longName)) return [];

    const type = (nonEmptyText(quote.quoteType) ?? '').toUpperCase();
    let assetClass = 'Stock';
    if (type.includes('ETF') || type.includes('MUTUAL')) assetClass = 'ETF';
    else if (type.includes('CRYPTOCURRENCY') || symbol.includes('-USD')) assetClass = 'Crypto';

    return [
      {
        symbol,
        name: longName || shortName || symbol,
        assetClass,
        sector: nonEmptyText(quote.sector) || (assetClass === 'Crypto' ? 'Cryptocurrency' : 'General'),
      },
    ];
  });
}

// Extensive market dictionary for instant zero-latency autocomplete
const POPULAR_TICKERS: TickerMatch[] = [
  // European & Global Popular ETFs
  { symbol: 'VUAA.DE', name: 'Vanguard S&P 500 UCITS ETF (EUR Acc)', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'VUAA.L', name: 'Vanguard S&P 500 UCITS ETF (USD Acc)', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'VUAG.L', name: 'Vanguard S&P 500 UCITS ETF (GBP Acc)', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'CSPX.L', name: 'iShares Core S&P 500 UCITS ETF (Acc)', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'IWDA.AS', name: 'iShares Core MSCI World UCITS ETF', assetClass: 'ETF', sector: 'Global' },
  { symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF', assetClass: 'ETF', sector: 'Global' },
  { symbol: 'EUNL.DE', name: 'iShares Core MSCI World UCITS ETF', assetClass: 'ETF', sector: 'Global' },
  { symbol: 'SXXP.DE', name: 'iShares STOXX Europe 600 UCITS ETF', assetClass: 'ETF', sector: 'Europe' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq 100)', assetClass: 'ETF', sector: 'Technology' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'ETF', sector: 'General Market' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'ETF', sector: 'General Market' },

  // Megacap Tech Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'Stock', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'Stock', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'Stock', sector: 'Consumer Cyclical' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', assetClass: 'Stock', sector: 'Communication Services' },
  { symbol: 'META', name: 'Meta Platforms Inc. (Facebook)', assetClass: 'Stock', sector: 'Communication Services' },
  { symbol: 'TSLA', name: 'Tesla Inc.', assetClass: 'Stock', sector: 'Consumer Cyclical' },
  { symbol: 'NFLX', name: 'Netflix Inc.', assetClass: 'Stock', sector: 'Communication Services' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', assetClass: 'Stock', sector: 'Technology' },
  { symbol: 'INTC', name: 'Intel Corporation', assetClass: 'Stock', sector: 'Technology' },
  { symbol: 'DIS', name: 'Walt Disney Co.', assetClass: 'Stock', sector: 'Communication Services' },

  // Spanish & European Stocks
  { symbol: 'SAN.MC', name: 'Banco Santander, S.A.', assetClass: 'Stock', sector: 'Financials' },
  { symbol: 'ITX.MC', name: 'Inditex (Zara), S.A.', assetClass: 'Stock', sector: 'Consumer Cyclical' },
  { symbol: 'BBVA.MC', name: 'Banco Bilbao Vizcaya Argentaria (BBVA)', assetClass: 'Stock', sector: 'Financials' },
  { symbol: 'TEF.MC', name: 'Telefónica, S.A.', assetClass: 'Stock', sector: 'Communication Services' },
  { symbol: 'IBE.MC', name: 'Iberdrola, S.A.', assetClass: 'Stock', sector: 'Utilities' },
  { symbol: 'CABK.MC', name: 'CaixaBank, S.A.', assetClass: 'Stock', sector: 'Financials' },
  { symbol: 'AMS.MC', name: 'Amadeus IT Group, S.A.', assetClass: 'Stock', sector: 'Technology' },

  // Cryptocurrencies
  { symbol: 'BTC-USD', name: 'Bitcoin (BTC)', assetClass: 'Crypto', sector: 'Cryptocurrency' },
  { symbol: 'ETH-USD', name: 'Ethereum (ETH)', assetClass: 'Crypto', sector: 'Cryptocurrency' },
  { symbol: 'SOL-USD', name: 'Solana (SOL)', assetClass: 'Crypto', sector: 'Cryptocurrency' },
  { symbol: 'ADA-USD', name: 'Cardano (ADA)', assetClass: 'Crypto', sector: 'Cryptocurrency' },
];

/**
 * Autocomplete ticker search triggered after typing 3+ characters
 */
export async function searchMarketTickers(query: string): Promise<TickerMatch[]> {
  if (!query || query.trim().length < 3) return [];
  const q = query.trim().toUpperCase();

  // Instant dictionary search
  const localMatches = POPULAR_TICKERS.filter(
    (t) => t.symbol.includes(q) || t.name.toUpperCase().includes(q)
  );

  try {
    const quotes = quotesOf(await getYf().search(q, { newsCount: 0, quotesCount: 8 }));
    if (quotes.length > 0) {
      // Merge localMatches and liveMatches without duplicates
      const symbolSet = new Set<string>();
      const combined: TickerMatch[] = [];

      for (const item of [...localMatches, ...liveMatchesFrom(quotes)]) {
        if (!symbolSet.has(item.symbol)) {
          symbolSet.add(item.symbol);
          combined.push(item);
        }
      }

      return combined.slice(0, 8);
    }
  } catch {
    // Silently fallback to pre-cached dictionary if offline or API error
  }

  return localMatches;
}

/** The instrument search as a port: the local dictionary first, then Yahoo. */
export const tickerSearch: TickerSearch = { search: searchMarketTickers };

/** The last traded price of one instrument and the currency it is quoted in; null when the market does not answer. */
export async function fetchLiveQuote(ticker: string): Promise<{ price: number; currency: string } | null> {
  try {
    const quote = await getYf().quote(ticker.toUpperCase());
    if (isRecord(quote) && typeof quote.regularMarketPrice === 'number' && quote.regularMarketPrice > 0 && typeof quote.currency === 'string') {
      return { price: quote.regularMarketPrice, currency: quote.currency };
    }
  } catch {
    // An unreachable market is "no price", never an error for the person.
  }
  return null;
}
