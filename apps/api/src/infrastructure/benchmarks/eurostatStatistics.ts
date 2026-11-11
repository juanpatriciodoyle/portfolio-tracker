import type { StatisticsFragment, StatisticsProvider } from '../../application/ports';
import { currencyExponent } from '../../domain/documentExtraction/currencies';
import { jsonStatCells } from './jsonStat';

const BASE_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const DECILES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'] as const;

/** Countries of the EU-SILC survey (and the EU as a whole, 'EU'): the code Eurostat uses for it, and its currency. */
const COUNTRIES: Readonly<Record<string, { geo: string; currency: string; unit?: string }>> = {
  // The EU as a whole has no national currency: its cut-offs are published in euros.
  EU: { geo: 'EU27_2020', currency: 'EUR', unit: 'EUR' },
  AT: { geo: 'AT', currency: 'EUR' }, BE: { geo: 'BE', currency: 'EUR' }, BG: { geo: 'BG', currency: 'BGN' },
  CH: { geo: 'CH', currency: 'CHF' }, CY: { geo: 'CY', currency: 'EUR' }, CZ: { geo: 'CZ', currency: 'CZK' },
  DE: { geo: 'DE', currency: 'EUR' }, DK: { geo: 'DK', currency: 'DKK' }, EE: { geo: 'EE', currency: 'EUR' },
  ES: { geo: 'ES', currency: 'EUR' }, FI: { geo: 'FI', currency: 'EUR' }, FR: { geo: 'FR', currency: 'EUR' },
  GR: { geo: 'EL', currency: 'EUR' }, HR: { geo: 'HR', currency: 'EUR' }, HU: { geo: 'HU', currency: 'HUF' },
  IE: { geo: 'IE', currency: 'EUR' }, IS: { geo: 'IS', currency: 'ISK' }, IT: { geo: 'IT', currency: 'EUR' },
  LT: { geo: 'LT', currency: 'EUR' }, LU: { geo: 'LU', currency: 'EUR' }, LV: { geo: 'LV', currency: 'EUR' },
  MT: { geo: 'MT', currency: 'EUR' }, NL: { geo: 'NL', currency: 'EUR' }, NO: { geo: 'NO', currency: 'NOK' },
  PL: { geo: 'PL', currency: 'PLN' }, PT: { geo: 'PT', currency: 'EUR' }, RO: { geo: 'RO', currency: 'RON' },
  SE: { geo: 'SE', currency: 'SEK' }, SI: { geo: 'SI', currency: 'EUR' }, SK: { geo: 'SK', currency: 'EUR' },
};

/**
 * Eurostat (EU-SILC), free and key-less: the income deciles of a country's equivalised net income per year
 * (`ilc_di01`) and the typical share of disposable income spent on housing (`ilc_mded01`).
 */
export class EurostatStatisticsProvider implements StatisticsProvider {
  readonly name = 'Eurostat';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  supports(countryCode: string): boolean {
    return countryCode in COUNTRIES;
  }

  async fetch(countryCode: string): Promise<StatisticsFragment> {
    const { geo, currency, unit = 'NAC' } = COUNTRIES[countryCode];
    const [income, housing] = await Promise.allSettled([this.incomeDistribution(geo, currency, unit), this.housingShare(geo)]);
    if (income.status === 'rejected' && housing.status === 'rejected') throw income.reason;

    return {
      ...(income.status === 'fulfilled' && income.value ? { incomeDistribution: income.value } : {}),
      ...(housing.status === 'fulfilled' && housing.value ? { housingCostShare: housing.value } : {}),
    };
  }

  private async get(dataset: string, query: string): Promise<unknown> {
    const response = await this.fetchFn(`${BASE_URL}/${dataset}?format=JSON&lang=en&${query}&lastTimePeriod=1`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Eurostat answered HTTP ${response.status} for ${dataset}`);
    return response.json();
  }

  private async incomeDistribution(geo: string, currency: string, unit: string): Promise<StatisticsFragment['incomeDistribution'] | null> {
    const quantiles = DECILES.map((decile) => `quant_inc=${decile}`).join('&');
    const cells = jsonStatCells(await this.get('ilc_di01', `geo=${geo}&statinfo=TC&unit=${unit}&${quantiles}`));
    const points = DECILES.flatMap((decile, index) => {
      const cell = cells.find(({ coordinates }) => coordinates.quant_inc === decile);
      return cell ? [{ percentile: (index + 1) * 10, value: Math.round(cell.value * 10 ** currencyExponent(currency)) }] : [];
    });
    if (points.length < DECILES.length) return null;

    return { source: 'EUROSTAT', period: cells[0].coordinates.time, currency, distribution: { period: 'YEAR', basis: 'EQUIVALISED', points } };
  }

  private async housingShare(geo: string): Promise<StatisticsFragment['housingCostShare'] | null> {
    const [cell] = jsonStatCells(await this.get('ilc_mded01', `geo=${geo}&hhcomp=TOTAL&rskpovth=TOTAL`));
    return cell && cell.value > 0 && cell.value < 100 ? { source: 'EUROSTAT', period: cell.coordinates.time, percent: cell.value } : null;
  }
}
