import type { FxQuote, FxRateProvider } from '../../application/ports';
import type { CalendarDate } from '../../contracts/vocabulary';

/**
 * Approximate value of one unit of each currency in euros. Not live: it is the last resort when no
 * live source answers, and what portfolio screens use for display. Shared so there is one table.
 */
export const REFERENCE_EUR_RATES = {
  EUR: 1.0,
  USD: 0.86236,
  GBP: 1.176,
  CHF: 1.052,
  JPY: 0.0061,
  CAD: 0.68,
  AUD: 0.61,
} as const;

export class ReferenceFxRateProvider implements FxRateProvider {
  async ratesFor(currencies: readonly string[], _on?: CalendarDate): Promise<FxQuote> {
    const rates: Record<string, number> = { EUR: 1 };
    const sources: Record<string, 'REFERENCE'> = {};
    for (const currency of new Set(currencies)) {
      if (currency !== 'EUR' && Object.hasOwn(REFERENCE_EUR_RATES, currency)) {
        rates[currency] = REFERENCE_EUR_RATES[currency as keyof typeof REFERENCE_EUR_RATES];
        sources[currency] = 'REFERENCE';
      }
    }
    return { rates, sources };
  }
}
