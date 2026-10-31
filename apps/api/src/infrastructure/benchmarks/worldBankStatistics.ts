import { z } from 'zod';
import type { StatisticsFragment, StatisticsProvider } from '../../application/ports';

const BASE_URL = 'https://api.worldbank.org/v2/country';

const rowsSchema = z.tuple([z.unknown(), z.array(z.object({ country: z.object({ id: z.string() }), date: z.string(), value: z.number().nullable() }))]);

/**
 * World Bank indicators, free and key-less, for every country: the PPP conversion factor (local currency units per
 * international dollar) and gross national income per person in international dollars.
 */
export class WorldBankStatisticsProvider implements StatisticsProvider {
  readonly name = 'World Bank';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  supports(countryCode: string): boolean {
    return /^[A-Z]{2}$/.test(countryCode);
  }

  async fetch(countryCode: string): Promise<StatisticsFragment> {
    const [ppp, gni] = await Promise.allSettled([this.latest(countryCode, 'PA.NUS.PPP'), this.latest(countryCode, 'NY.GNP.PCAP.PP.CD')]);
    if (ppp.status === 'rejected') throw ppp.reason;
    if (!ppp.value) return {};

    return {
      purchasing: {
        source: 'WORLD_BANK',
        period: ppp.value.period,
        lcuPerInternationalDollar: ppp.value.value,
        gniPerPersonDollars: gni.status === 'fulfilled' ? (gni.value?.value ?? null) : null,
      },
    };
  }

  /** The most recent positive value of an indicator, or null when the World Bank has none (or answers with an error message). */
  private async latest(countryCode: string, indicator: string): Promise<{ value: number; period: string } | null> {
    const response = await this.fetchFn(`${BASE_URL}/${countryCode}/indicator/${indicator}?format=json&mrnev=1`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`World Bank answered HTTP ${response.status} for ${indicator}`);

    const parsed = rowsSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const row = parsed.data[1].find(({ country, value }) => country.id === countryCode && value !== null && value > 0);
    return row ? { value: row.value as number, period: row.date } : null;
  }
}
