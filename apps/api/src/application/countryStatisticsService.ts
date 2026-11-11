import { WORLD_AREA, continentAreaOf, isReferenceArea } from '../domain/standing';
import type { CountryStatistics, CountryStatisticsRepository, JobLock, StatisticsFragment, StatisticsProvider, StoredCountryStatistics } from './ports';

const DAY_MS = 86_400_000;

export interface CountryStatisticsServiceDeps {
  readonly repository: CountryStatisticsRepository;
  /** In order of preference: when two publish the same statistic, the earlier one wins. */
  readonly providers: readonly StatisticsProvider[];
  /** The clock, in milliseconds since the epoch. */
  readonly now: () => number;
  /** How old a country's statistics may get before they are fetched again. */
  readonly maxAgeDays?: number;
  /** The same for the EU, the World Bank regions and the world, which change slowly: about six months. */
  readonly areaMaxAgeDays?: number;
  /** After every provider failed for a country, how long to leave it alone. */
  readonly failureCooldownMs?: number;
}

const PARTS = ['incomeDistribution', 'housingCostShare', 'purchasing', 'regionCode', 'referenceDistribution'] as const;

/** What is published for each country, cached and refreshed about monthly. Public data: nothing here is personal. */
export class CountryStatisticsService {
  private readonly repository: CountryStatisticsRepository;
  private readonly providers: readonly StatisticsProvider[];
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly areaMaxAgeMs: number;
  private readonly cooldownMs: number;
  private readonly inFlight = new Map<string, Promise<StoredCountryStatistics | null>>();
  private readonly failedAt = new Map<string, number>();

  constructor({ repository, providers, now, maxAgeDays = 35, areaMaxAgeDays = 183, failureCooldownMs = 15 * 60_000 }: CountryStatisticsServiceDeps) {
    this.repository = repository;
    this.providers = providers;
    this.now = now;
    this.maxAgeMs = maxAgeDays * DAY_MS;
    this.areaMaxAgeMs = areaMaxAgeDays * DAY_MS;
    this.cooldownMs = failureCooldownMs;
  }

  /** The cached statistics, refreshed first when missing or old. Null when there are none and the providers cannot be reached. */
  async get(countryCode: string): Promise<StoredCountryStatistics | null> {
    const cached = await this.repository.find(countryCode);
    if (cached && this.now() - Date.parse(cached.fetchedAt) < (isReferenceArea(countryCode) ? this.areaMaxAgeMs : this.maxAgeMs)) return cached;

    const failedAt = this.failedAt.get(countryCode);
    if (failedAt !== undefined && this.now() - failedAt < this.cooldownMs) return cached;

    let pending = this.inFlight.get(countryCode);
    if (!pending) {
      pending = this.refresh(countryCode, cached).finally(() => this.inFlight.delete(countryCode));
      this.inFlight.set(countryCode, pending);
    }
    return (await pending) ?? cached;
  }

  /**
   * What is cached for a country or area, however old, without waiting for the providers: a missing or stale entry is
   * refreshed in the background, for the next request. For anything slow, such as the world's distribution.
   */
  async cached(countryCode: string): Promise<StoredCountryStatistics | null> {
    const cached = await this.repository.find(countryCode);
    const maxAge = isReferenceArea(countryCode) ? this.areaMaxAgeMs : this.maxAgeMs;
    if (!cached || this.now() - Date.parse(cached.fetchedAt) >= maxAge) void this.get(countryCode).catch(() => null);
    return cached;
  }

  private async refresh(countryCode: string, previous: StoredCountryStatistics | null): Promise<StoredCountryStatistics | null> {
    const asked = this.providers.filter((provider) => provider.supports(countryCode));
    const answers = await Promise.allSettled(asked.map((provider) => provider.fetch(countryCode)));

    if (asked.length > 0 && answers.every((answer) => answer.status === 'rejected')) {
      this.failedAt.set(countryCode, this.now());
      return null;
    }

    const fragments = answers.flatMap((answer) => (answer.status === 'fulfilled' ? [answer.value] : []));
    const stored: StoredCountryStatistics = {
      statistics: mergeStatistics(countryCode, fragments, previous?.statistics ?? null),
      fetchedAt: new Date(this.now()).toISOString(),
    };
    await this.repository.save(stored);
    this.failedAt.delete(countryCode);
    return stored;
  }
}

/** The first fragment to publish a statistic wins; a statistic nobody published this time stays as it was. */
function mergeStatistics(countryCode: string, fragments: readonly StatisticsFragment[], previous: CountryStatistics | null): CountryStatistics {
  const merged: Record<string, unknown> = { countryCode };
  for (const part of PARTS) merged[part] = fragments.find((fragment) => fragment[part])?.[part] ?? previous?.[part] ?? null;
  return merged as unknown as CountryStatistics;
}

export interface BenchmarkRefresherDeps {
  readonly statistics: CountryStatisticsService;
  readonly lock: JobLock;
  /** Every country somebody has a living phase in. */
  readonly countriesInUse: () => Promise<readonly string[]>;
}

/** The daily job: brings the statistics of the countries in use, and the areas they are compared with, up to date, on one server at a time. */
export class BenchmarkRefresher {
  constructor(private readonly deps: BenchmarkRefresherDeps) {}

  run(): Promise<'ran' | 'skipped'> {
    return this.deps.lock.runExclusive('country-statistics-refresh', async () => {
      const areas = new Set<string>([WORLD_AREA.code]);
      for (const countryCode of new Set(await this.deps.countriesInUse())) {
        const stored = await this.deps.statistics.get(countryCode).catch(() => null);
        const continent = continentAreaOf(countryCode, stored?.statistics.regionCode ?? null);
        if (continent) areas.add(continent.code);
      }
      // The EU, the regions and the world are shared by everyone: each is fetched once, and only when about six months old.
      for (const areaCode of areas) await this.deps.statistics.get(areaCode).catch(() => null);
    });
  }
}
