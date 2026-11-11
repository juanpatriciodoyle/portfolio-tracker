import { z } from 'zod';
import type { StatisticsFragment, StatisticsProvider } from '../../application/ports';
import { WORLD_BANK_REGION_CODES } from '../../domain/standing';

const PIP_URL = 'https://api.worldbank.org/pip/v1/pip-grp';
const CPI_URL = 'https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json&date=2021:2035';

/** The PPP round the distributions are asked in. Pinned, so a new default at the World Bank cannot change the unit silently. */
export const PIP_PPP_ROUND = '2021';
const BASE_YEAR = '2021';

/** International dollars a day, 2021 prices: from the poorest lines to far beyond a high income. */
const LINES = [1, 2, 3, 4, 6, 8, 10, 13, 17, 22, 30, 40, 55, 75, 100, 150, 200, 300, 500];
const CONCURRENCY = 5;

const rowsSchema = z.array(
  z.object({
    region_name: z.string(),
    reporting_year: z.number().int(),
    headcount: z.number().min(0).max(1),
    estimate_type: z.string(),
  })
);
const cpiSchema = z.tuple([z.unknown(), z.array(z.object({ date: z.string(), value: z.number().nullable() }))]);

/**
 * The World Bank Poverty and Inequality Platform, free and key-less. For the world and each region it answers "what share
 * of people live on less than L dollars a day" (`headcount`, international dollars at 2021 prices): asked for many lines,
 * that is the distribution itself. Only years of real survey data count; forecasts ("nowcast") are ignored.
 */
export class WorldBankPipStatisticsProvider implements StatisticsProvider {
  readonly name = 'World Bank PIP';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 15_000
  ) {}

  supports(areaCode: string): boolean {
    return WORLD_BANK_REGION_CODES.includes(areaCode);
  }

  async fetch(areaCode: string): Promise<StatisticsFragment> {
    const [year, priceIndex] = await Promise.all([this.latestSurveyYear(areaCode), this.priceIndex()]);

    const shares: { line: number; headcount: number }[] = [];
    let areaName = '';
    for (let i = 0; i < LINES.length; i += CONCURRENCY) {
      const chunk = await Promise.all(
        LINES.slice(i, i + CONCURRENCY).map(async (line) => {
          const [row] = await this.rows(`country=${areaCode}&year=${year}&povline=${line}&group_by=wb&ppp_version=${PIP_PPP_ROUND}&format=json`);
          if (!row) throw new Error(`The World Bank has no ${year} figure for ${areaCode} at ${line} dollars a day`);
          areaName = row.region_name;
          return { line, headcount: row.headcount };
        })
      );
      shares.push(...chunk);
    }

    // Points rise in both columns; once everyone is below a line, higher lines add nothing.
    const points: { percentile: number; value: number }[] = [];
    for (const { line, headcount } of shares) {
      const percentile = Math.round(headcount * 10_000) / 100;
      const last = points[points.length - 1];
      if (percentile > 0 && (!last || percentile > last.percentile)) points.push({ percentile, value: line });
    }
    if (points.length < 2) throw new Error(`The World Bank answer for ${areaCode} is too flat to use`);

    return {
      referenceDistribution: { source: 'WORLD_BANK', period: String(year), areaName, points, priceIndex },
    };
  }

  private async get(url: string): Promise<unknown> {
    const response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The World Bank answered HTTP ${response.status}`);
    return response.json();
  }

  private async rows(query: string) {
    return rowsSchema.parse(await this.get(`${PIP_URL}?${query}`));
  }

  private async latestSurveyYear(areaCode: string): Promise<number> {
    const rows = await this.rows(`country=${areaCode}&year=all&povline=30&group_by=wb&ppp_version=${PIP_PPP_ROUND}&format=json`);
    const years = rows.filter((row) => row.estimate_type === 'actual').map((row) => row.reporting_year);
    if (years.length === 0) throw new Error(`The World Bank has no survey year for ${areaCode}`);
    return Math.max(...years);
  }

  /** How much US consumer prices rose from 2021 to each later year the World Bank has published. */
  private async priceIndex(): Promise<Record<string, number>> {
    const parsed = cpiSchema.parse(await this.get(CPI_URL));
    const byYear = new Map(parsed[1].flatMap((row) => (row.value !== null && row.value > 0 ? [[row.date, row.value] as const] : [])));
    const base = byYear.get(BASE_YEAR);
    if (!base || byYear.size < 2) throw new Error('The World Bank has no US price index to bring incomes to 2021 prices');
    return Object.fromEntries([...byYear].filter(([year]) => year >= BASE_YEAR).map(([year, value]) => [year, value / base]));
  }
}
