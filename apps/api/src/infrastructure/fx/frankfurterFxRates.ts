import { z } from 'zod';
import type { FxQuote, FxRateProvider } from '../../application/ports';
import type { CalendarDate } from '../../contracts/vocabulary';

const BASE_URL = 'https://api.frankfurter.dev/v1/';

const responseSchema = z.object({ rates: z.record(z.string(), z.number().positive()) });

/** Free ECB reference rates through Frankfurter (no key). Currencies the ECB does not publish, such as ARS, are left out. */
export class FrankfurterFxRateProvider implements FxRateProvider {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 5000
  ) {}

  async ratesFor(currencies: readonly string[], on: CalendarDate): Promise<FxQuote> {
    const symbols = [...new Set(currencies)].filter((currency) => currency !== 'EUR').sort();
    const rates: Record<string, number> = { EUR: 1 };
    const sources: Record<string, 'ECB'> = {};
    if (symbols.length === 0) return { rates, sources };

    const response = await this.fetchFn(`${BASE_URL}${on}?base=EUR&symbols=${symbols.join(',')}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Frankfurter answered HTTP ${response.status}`);

    const { rates: perEuro } = responseSchema.parse(await response.json());
    for (const symbol of symbols) {
      if (perEuro[symbol] !== undefined) {
        rates[symbol] = 1 / perEuro[symbol]; // the API gives units per euro; we keep the value of one unit in euros
        sources[symbol] = 'ECB';
      }
    }
    return { rates, sources };
  }
}
