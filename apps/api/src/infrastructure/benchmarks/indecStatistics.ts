import { z } from 'zod';
import type { StatisticsFragment, StatisticsProvider } from '../../application/ports';

const SERIES_URL = 'https://apis.datos.gob.ar/series/api/series/';
/** Mean income per person of each decile, in current pesos a month: deciles 1-9, then the tenth (it has its own series name). */
const DECILE_SERIES = [
  ...Array.from({ length: 9 }, (_, index) => `301.1_DECIL_${index + 1}_IPPCF_0_T_12`),
  '301.1_DECIL_10_IPCF_0_T_13',
];
/** The latest quarters often miss the lowest deciles; a quarter needs at least this many deciles to be used. */
const MIN_DECILES = 8;
const QUARTERS_TO_LOOK_BACK = 8;

const responseSchema = z.object({ data: z.array(z.tuple([z.string()]).rest(z.number().nullable())) });

const quarterLabel = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;

/**
 * INDEC (Argentina) through datos.gob.ar, free and key-less: the average income per person in each decile of
 * families, quarterly, in current pesos. Each mean sits at the middle of its decile.
 */
export class IndecStatisticsProvider implements StatisticsProvider {
  readonly name = 'INDEC';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  supports(countryCode: string): boolean {
    return countryCode === 'AR';
  }

  async fetch(_countryCode: string): Promise<StatisticsFragment> {
    const response = await this.fetchFn(`${SERIES_URL}?ids=${DECILE_SERIES.join(',')}&limit=${QUARTERS_TO_LOOK_BACK}&sort=desc&format=json`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`datos.gob.ar answered HTTP ${response.status}`);

    const { data } = responseSchema.parse(await response.json());
    for (const [date, ...means] of data) {
      const points = means.flatMap((mean, index) => (mean === null || mean <= 0 ? [] : [{ percentile: (index + 1) * 10 - 5, value: Math.round(mean * 100) }]));
      if (points.length >= MIN_DECILES) {
        return {
          incomeDistribution: { source: 'INDEC', period: quarterLabel(date), currency: 'ARS', distribution: { period: 'MONTH', basis: 'PER_CAPITA', points } },
        };
      }
    }
    return {};
  }
}
