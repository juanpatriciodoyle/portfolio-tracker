import { BenchmarkService } from '../application/benchmarkService';
import { BenchmarkRefresher, CountryStatisticsService } from '../application/countryStatisticsService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import type { JobLock, StatisticsFragment, StatisticsProvider } from '../application/ports';
import { benchmarksResponse, createLivingPhaseRequest } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryCountryStatisticsRepository } from './support/inMemoryCountryStatistics';
import { InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const DAY = 86_400_000;
const USER = 'user-1';

const spainFragment: StatisticsFragment = {
  incomeDistribution: {
    source: 'EUROSTAT',
    period: '2025',
    currency: 'EUR',
    distribution: {
      period: 'YEAR',
      basis: 'EQUIVALISED',
      points: [9091, 12374, 15130, 17742, 20367, 23372, 26791, 31569, 39385].map((euros, index) => ({ percentile: (index + 1) * 10, value: euros * 100 })),
    },
  },
  housingCostShare: { source: 'EUROSTAT', period: '2025', percent: 16 },
};
const spainPurchasing: StatisticsFragment = { purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 0.570991, gniPerPersonDollars: 59830 } };
const argentinaFragment: StatisticsFragment = {
  incomeDistribution: {
    source: 'INDEC',
    period: '2026-Q1',
    currency: 'ARS',
    distribution: {
      period: 'MONTH',
      basis: 'PER_CAPITA',
      points: [308588, 382238, 461506, 554804, 679991, 882599, 1209872, 2435937].map((pesos, index) => ({ percentile: 25 + index * 10, value: pesos * 100 })),
    },
  },
};
const argentinaPurchasing: StatisticsFragment = { purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 567.297421343424, gniPerPersonDollars: 31920 } };

function provider(name: string, countries: string[], answers: Record<string, StatisticsFragment | Error>): StatisticsProvider & { fetch: jest.Mock } {
  return {
    name,
    supports: (country) => countries.includes(country),
    fetch: jest.fn(async (country: string) => {
      const answer = answers[country] ?? {};
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

function statisticsWorld(options: { providers?: StatisticsProvider[]; start?: number } = {}) {
  const repository = new InMemoryCountryStatisticsRepository();
  const clock = { now: options.start ?? Date.parse('2026-10-31T12:00:00Z') };
  const providers = options.providers ?? [
    provider('eurostat', ['ES'], { ES: spainFragment }),
    provider('indec', ['AR'], { AR: argentinaFragment }),
    provider('worldbank', ['ES', 'AR', 'JP'], { ES: spainPurchasing, AR: argentinaPurchasing }),
  ];
  const statistics = new CountryStatisticsService({ repository, providers, now: () => clock.now });
  return { repository, clock, providers, statistics };
}

describe('CountryStatisticsService', () => {
  it('fetches a country once, merges what the providers publish, and serves the cache after that', async () => {
    const { statistics, providers } = statisticsWorld();

    const first = await statistics.get('ES');
    const second = await statistics.get('ES');

    expect(first?.statistics).toMatchObject({
      countryCode: 'ES',
      incomeDistribution: { source: 'EUROSTAT' },
      housingCostShare: { percent: 16 },
      purchasing: { source: 'WORLD_BANK', lcuPerInternationalDollar: 0.570991 },
    });
    expect(first?.fetchedAt).toBe('2026-10-31T12:00:00.000Z');
    expect(second).toEqual(first);
    expect(providers[0].fetch).toHaveBeenCalledTimes(1);
    expect(providers[2].fetch).toHaveBeenCalledTimes(1);
  });

  it('asks only the providers that support the country', async () => {
    const { statistics, providers } = statisticsWorld();

    await statistics.get('AR');

    expect(providers[0].fetch).not.toHaveBeenCalled();
    expect(providers[1].fetch).toHaveBeenCalledTimes(1);
  });

  it('lets an earlier provider win when two publish the same statistic', async () => {
    const worldBankIncome: StatisticsFragment = { incomeDistribution: { ...spainFragment.incomeDistribution!, source: 'WORLD_BANK', period: '2019' } };
    const { statistics } = statisticsWorld({ providers: [provider('eurostat', ['ES'], { ES: spainFragment }), provider('worldbank', ['ES'], { ES: worldBankIncome })] });

    expect((await statistics.get('ES'))?.statistics.incomeDistribution?.source).toBe('EUROSTAT');
  });

  it('remembers that a country has no published statistics instead of asking every time', async () => {
    const { statistics, providers } = statisticsWorld();

    const first = await statistics.get('JP');
    await statistics.get('JP');

    expect(first?.statistics).toEqual({ countryCode: 'JP', incomeDistribution: null, housingCostShare: null, purchasing: null });
    expect(providers[2].fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes after 35 days, and keeps the old figures when the refresh fails', async () => {
    const failing = provider('eurostat', ['ES'], { ES: spainFragment });
    const { statistics, clock } = statisticsWorld({ providers: [failing] });
    await statistics.get('ES');

    clock.now += 36 * DAY;
    failing.fetch.mockRejectedValue(new Error('down'));
    const stale = await statistics.get('ES');

    expect(failing.fetch).toHaveBeenCalledTimes(2);
    expect(stale?.statistics.housingCostShare?.percent).toBe(16);
    expect(stale?.fetchedAt).toBe('2026-10-31T12:00:00.000Z');
  });

  it('updates the cache when the refresh works', async () => {
    const eurostat = provider('eurostat', ['ES'], { ES: spainFragment });
    const { statistics, clock } = statisticsWorld({ providers: [eurostat] });
    await statistics.get('ES');
    clock.now += 36 * DAY;
    eurostat.fetch.mockResolvedValue({ housingCostShare: { source: 'EUROSTAT', period: '2026', percent: 17 } });

    const fresh = await statistics.get('ES');

    expect(fresh?.statistics.housingCostShare?.percent).toBe(17);
    expect(fresh?.fetchedAt).toBe('2026-12-06T12:00:00.000Z');
  });

  it('keeps a part another provider could not deliver this time', async () => {
    const eurostat = provider('eurostat', ['ES'], { ES: spainFragment });
    const worldBank = provider('worldbank', ['ES'], { ES: spainPurchasing });
    const { statistics, clock } = statisticsWorld({ providers: [eurostat, worldBank] });
    await statistics.get('ES');
    clock.now += 36 * DAY;
    worldBank.fetch.mockRejectedValue(new Error('down'));

    const refreshed = await statistics.get('ES');

    expect(refreshed?.statistics.purchasing?.lcuPerInternationalDollar).toBe(0.570991);
    expect(refreshed?.statistics.housingCostShare?.percent).toBe(16);
  });

  it('does not store an outage as "no data", and does not hammer a provider that is down', async () => {
    const down = provider('eurostat', ['ES'], { ES: new Error('down') });
    const { statistics, clock, repository } = statisticsWorld({ providers: [down] });

    expect(await statistics.get('ES')).toBeNull();
    expect(await statistics.get('ES')).toBeNull();
    expect(down.fetch).toHaveBeenCalledTimes(1);
    expect(await repository.find('ES')).toBeNull();

    clock.now += 16 * 60_000;
    down.fetch.mockResolvedValue(spainFragment);
    expect((await statistics.get('ES'))?.statistics.housingCostShare?.percent).toBe(16);
  });

  it('shares one fetch between simultaneous requests', async () => {
    const { statistics, providers } = statisticsWorld();

    await Promise.all([statistics.get('ES'), statistics.get('ES'), statistics.get('ES')]);

    expect(providers[0].fetch).toHaveBeenCalledTimes(1);
  });
});

describe('BenchmarkRefresher (the monthly job)', () => {
  const lock = (available = true): JobLock & { names: string[] } => {
    const names: string[] = [];
    return {
      names,
      runExclusive: async (name, task) => {
        names.push(name);
        if (!available) return 'skipped';
        await task();
        return 'ran';
      },
    };
  };

  it('refreshes the countries people live in whose statistics are missing or old, and nothing else', async () => {
    const { statistics, clock, providers } = statisticsWorld();
    await statistics.get('ES');
    clock.now += 10 * DAY;
    const jobLock = lock();

    const outcome = await new BenchmarkRefresher({ statistics, lock: jobLock, countriesInUse: async () => ['ES', 'AR'] }).run();

    expect(outcome).toBe('ran');
    expect(jobLock.names).toEqual(['country-statistics-refresh']);
    expect(providers[0].fetch).toHaveBeenCalledTimes(1);
    expect(providers[1].fetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing when another server holds the lock', async () => {
    const { statistics, providers } = statisticsWorld();

    expect(await new BenchmarkRefresher({ statistics, lock: lock(false), countriesInUse: async () => ['ES'] }).run()).toBe('skipped');
    expect(providers[0].fetch).not.toHaveBeenCalled();
  });

  it('carries on with the other countries when one fails', async () => {
    const providers = [provider('eurostat', ['ES'], { ES: new Error('down') }), provider('indec', ['AR'], { AR: argentinaFragment })];
    const { statistics } = statisticsWorld({ providers });

    await new BenchmarkRefresher({ statistics, lock: lock(), countriesInUse: async () => ['ES', 'AR'] }).run();

    expect(providers[1].fetch).toHaveBeenCalled();
  });
});

async function benchmarkWorld() {
  let ids = 0;
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 5));
  const phaseRepository = new InMemoryLivingPhaseRepository();
  const profileRepository = new InMemoryProfileRepository();
  const phases = new LivingPhaseService({ repository: phaseRepository, cipher, newId: () => `id-${++ids}` });
  const profiles = new ProfileService({ repository: profileRepository, cipher });
  const world = statisticsWorld();
  const service = new BenchmarkService({ phases, profiles, statistics: world.statistics });
  return { ...world, phases, profiles, service };
}

const madrid = createLivingPhaseRequest.parse({
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  endDate: '2024-08-31',
  currency: 'EUR',
  monthlyIncomeMinor: 320000,
  fixedCosts: [
    { category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 },
    { category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600 },
    { category: 'INTERNET', cadence: 'MONTHLY', amountMinor: 4000 },
  ],
});
const buenosAires = createLivingPhaseRequest.parse({
  name: 'Buenos Aires',
  city: 'Buenos Aires',
  countryCode: 'AR',
  tenure: 'RENT',
  startDate: '2024-09-01',
  currency: 'ARS',
  monthlyIncomeMinor: 200_000_000,
  fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 40_000_000 }],
});

describe('BenchmarkService', () => {
  it('compares each living phase with its country: income percentile, housing burden and purchasing power', async () => {
    const { service, phases } = await benchmarkWorld();
    await phases.createPhase(USER, madrid);
    await phases.createPhase(USER, buenosAires);

    const result = benchmarksResponse.parse(await service.benchmarks(USER, '2026-10-31'));

    expect(result.refreshedAt).toBe('2026-10-31T12:00:00.000Z');
    expect(result.phases.map((phase) => phase.name)).toEqual(['Madrid', 'Buenos Aires']);

    expect(result.phases[0]).toMatchObject({
      countryCode: 'ES',
      household: { adults: 1, children: 0 },
      incomePercentile: { percentile: 88.7, bound: 'EXACT', source: 'EUROSTAT', period: '2025', basis: 'EQUIVALISED' },
      // rent 1 200 + electricity 48 a month = 1 248 of 3 200
      housingBurden: { housingMonthlyMinor: 124800, yourSharePercent: 39, typicalSharePercent: 16, differencePoints: 23, verdict: 'HIGHER' },
      purchasingPower: { internationalDollarsPerMonth: 5604.29, versusPreviousPhase: null, versusNationalAverage: 1.12 },
      gaps: [],
    });
    expect(result.phases[1]).toMatchObject({
      countryCode: 'AR',
      incomePercentile: { percentile: 91.4, bound: 'EXACT', source: 'INDEC', period: '2026-Q1', basis: 'PER_CAPITA' },
      housingBurden: null,
      purchasingPower: { internationalDollarsPerMonth: 3525.49, versusPreviousPhase: { phaseId: result.phases[0].phaseId, ratio: 0.63 } },
      gaps: ['NO_HOUSING_BASELINE'],
    });
  });

  it('counts the household from the profile', async () => {
    const { service, phases, profiles } = await benchmarkWorld();
    await phases.createPhase(USER, madrid);
    await profiles.saveProfile(USER, { fullName: null, birthYear: null, nationalities: [], taxResidence: null, householdAdults: 2, dependentChildren: 2, employmentStatus: null }, '2026-10-31');

    const [phase] = (await service.benchmarks(USER, '2026-10-31')).phases;

    expect(phase.household).toEqual({ adults: 2, children: 2 });
    expect(phase.incomePercentile!.percentile).toBeLessThan(88.7);
  });

  it('says what is missing instead of guessing', async () => {
    const { service, phases } = await benchmarkWorld();
    await phases.createPhase(USER, { ...madrid, monthlyIncomeMinor: 0 });
    await phases.createPhase(USER, { ...buenosAires, countryCode: 'JP', currency: 'JPY', startDate: '2024-09-01', monthlyIncomeMinor: 500000 });

    const [noIncome, japan] = (await service.benchmarks(USER, '2026-10-31')).phases;

    expect(noIncome).toMatchObject({ incomePercentile: null, housingBurden: null, gaps: ['NO_INCOME'] });
    expect(japan).toMatchObject({ incomePercentile: null, housingBurden: null, purchasingPower: null, gaps: ['NO_DISTRIBUTION', 'NO_HOUSING_BASELINE', 'NO_PURCHASING_POWER'] });
  });

  it('survives a country whose statistics are unavailable', async () => {
    const providers = [provider('eurostat', ['ES'], { ES: new Error('down') })];
    const world = statisticsWorld({ providers });
    const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 5));
    const phases = new LivingPhaseService({ repository: new InMemoryLivingPhaseRepository(), cipher });
    const service = new BenchmarkService({ phases, profiles: new ProfileService({ repository: new InMemoryProfileRepository(), cipher }), statistics: world.statistics });
    await phases.createPhase(USER, madrid);

    const result = await service.benchmarks(USER, '2026-10-31');

    expect(result.refreshedAt).toBeNull();
    expect(result.phases[0].gaps).toEqual(['NO_DISTRIBUTION', 'NO_HOUSING_BASELINE', 'NO_PURCHASING_POWER']);
  });

  it('is empty for someone without living phases, and never shows another person’s phases', async () => {
    const { service, phases } = await benchmarkWorld();
    await phases.createPhase('someone-else', madrid);

    expect(await service.benchmarks(USER, '2026-10-31')).toEqual({ asOf: '2026-10-31', refreshedAt: null, phases: [] });
  });
});
