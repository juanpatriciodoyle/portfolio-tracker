import type { FxQuote, FxRateProvider } from '../../application/ports';
import type { CalendarDate, FxRateSource } from '../../contracts/vocabulary';
import type { BcraOfficialRateSource } from './bcraOfficialRates';

const MAX_CACHED_QUOTES = 200;

export interface LiveFxRateProviderDeps {
  readonly ecb: FxRateProvider;
  readonly bcra: Pick<BcraOfficialRateSource, 'pesosPerDollar'>;
  readonly reference: FxRateProvider;
}

/**
 * Live rates where possible: ECB for the currencies it publishes, the official BCRA rate for Argentine
 * pesos (priced through the ECB dollar), and the approximate reference table for anything a live source
 * could not answer. A currency nobody can price is left out. Only fully live answers are remembered.
 */
export class LiveFxRateProvider implements FxRateProvider {
  private readonly cache = new Map<string, FxQuote>();

  constructor(private readonly deps: LiveFxRateProviderDeps) {}

  async ratesFor(currencies: readonly string[], on: CalendarDate): Promise<FxQuote> {
    const wanted = [...new Set(currencies)].filter((currency) => currency !== 'EUR').sort();
    const key = `${on}|${wanted.join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const rates: Record<string, number> = { EUR: 1 };
    const sources: Record<string, FxRateSource> = {};

    const fromEcb = wanted.filter((currency) => currency !== 'ARS');
    const needsDollar = wanted.includes('ARS');
    const ecbRequest = needsDollar && !fromEcb.includes('USD') ? [...fromEcb, 'USD'] : fromEcb;

    let dollarInEuros: number | undefined;
    if (ecbRequest.length > 0) {
      try {
        const quote = await this.deps.ecb.ratesFor(ecbRequest, on);
        for (const currency of fromEcb) {
          if (quote.rates[currency] !== undefined) {
            rates[currency] = quote.rates[currency];
            sources[currency] = 'ECB';
          }
        }
        dollarInEuros = quote.rates.USD;
      } catch {
        // fall through to the reference table below
      }
    }

    if (needsDollar && dollarInEuros !== undefined) {
      try {
        rates.ARS = dollarInEuros / (await this.deps.bcra.pesosPerDollar(on));
        sources.ARS = 'BCRA_OFFICIAL';
      } catch {
        // pesos stay unpriced: there is no honest approximation
      }
    }

    const unpriced = wanted.filter((currency) => rates[currency] === undefined);
    if (unpriced.length > 0) {
      const reference = await this.deps.reference.ratesFor(unpriced, on);
      for (const currency of unpriced) {
        if (reference.rates[currency] !== undefined) {
          rates[currency] = reference.rates[currency];
          sources[currency] = 'REFERENCE';
        }
      }
    }

    const quote: FxQuote = { rates, sources };
    if (wanted.every((currency) => sources[currency] !== undefined && sources[currency] !== 'REFERENCE')) {
      if (this.cache.size >= MAX_CACHED_QUOTES) this.cache.clear();
      this.cache.set(key, quote);
    }
    return quote;
  }
}
