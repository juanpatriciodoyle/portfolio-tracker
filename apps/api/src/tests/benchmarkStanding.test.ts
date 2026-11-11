import { salary } from './support/income';
import { BenchmarkService } from '../application/benchmarkService';
import { BenchmarkRefresher, CountryStatisticsService } from '../application/countryStatisticsService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import type { FxRateProvider, JobLock, StatisticsFragment, StatisticsProvider } from '../application/ports';
import { benchmarksResponse, createLivingPhaseRequest } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryCountryStatisticsRepository } from './support/inMemoryCountryStatistics';
import { InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const DAY = 86_400_000;
const USER = 'user-1';
const NOW = Date.parse('2026-10-31T12:00:00Z');

const spain: StatisticsFragment = {
  regionCode: 'ECS',
  incomeDistribution: {
    source: 'EUROSTAT',
    period: '2025',
    currency: 'EUR',
    distribution: { period: 'YEAR', basis: 'EQUIVALISED', points: [9091, 12374, 15130, 17742, 20367, 23372, 26791, 31569, 39385].map((euros, i) => ({ percentile: (i + 1) * 10, value: euros * 100 })) },
  },
  housingCostShare: { source: 'EUROSTAT', period: '2025', percent: 16 },
  purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 0.570991, gniPerPersonDollars: 59830 },
};
const argentina: StatisticsFragment = {
  regionCode: 'LCN',
  purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 567.297421343424, gniPerPersonDollars: 31920 },
};
const japan: StatisticsFragment = { regionCode: 'EAS', purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 100, gniPerPersonDollars: null } };
const nowhere: StatisticsFragment = {};
const eu: StatisticsFragment = {
  incomeDistribution: {
    source: 'EUROSTAT',
    period: '2025',
    currency: 'EUR',
    distribution: { period: 'YEAR', basis: 'EQUIVALISED', points: [11605, 15200, 18000, 20800, 23500, 26300, 29600, 34500, 42084].map((euros, i) => ({ percentile: (i + 1) * 10, value: euros * 100 })) },
  },
  housingCostShare: { source: 'EUROSTAT', period: '2025', percent: 18.9 },
};
const priceIndex = { '2021': 1, '2024': 1.2, '2025': 1.25 };
const world: StatisticsFragment = {
  referenceDistribution: {
    source: 'WORLD_BANK',
    period: '2024',
    areaName: 'World',
    priceIndex,
    points: [{ percentile: 10, value: 2 }, { percentile: 30, value: 5 }, { percentile: 50, value: 10 }, { percentile: 70, value: 20 }, { percentile: 90, value: 50 }, { percentile: 97, value: 100 }, { percentile: 99, value: 200 }],
  },
};
const latinAmerica: StatisticsFragment = {
  referenceDistribution: {
    source: 'WORLD_BANK',
    period: '2024',
    areaName: 'Latin America & Caribbean',
    priceIndex,
    points: [{ percentile: 10, value: 3 }, { percentile: 30, value: 7 }, { percentile: 50, value: 13 }, { percentile: 70, value: 25 }, { percentile: 90, value: 60 }, { percentile: 99, value: 250 }],
  },
};

function provider(name: string, answers: Record<string, StatisticsFragment | Error>): StatisticsProvider & { fetch: jest.Mock } {
  return {
    name,
    supports: (code) => code in answers,
    fetch: jest.fn(async (code: string) => {
      const answer = answers[code];
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

function world_(answers: Record<string, StatisticsFragment | Error> = { ES: spain, AR: argentina, JP: japan, EU: eu, WLD: world, LCN: latinAmerica, EAS: latinAmerica }) {
  const repository = new InMemoryCountryStatisticsRepository();
  const clock = { now: NOW };
  const providers = [provider('all', answers)];
  const statistics = new CountryStatisticsService({ repository, providers, now: () => clock.now });
  return { repository, clock, providers, statistics };
}

async function setup(answers?: Record<string, StatisticsFragment | Error>, fx?: FxRateProvider, prime = true) {
  let ids = 0;
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 5));
  const phases = new LivingPhaseService({ repository: new InMemoryLivingPhaseRepository(), cipher, newId: () => `id-${++ids}` });
  const profiles = new ProfileService({ repository: new InMemoryProfileRepository(), cipher });
  const stats = world_(answers);
  const service = new BenchmarkService({ phases, profiles, statistics: stats.statistics, fx });
  // The daily job has run: the areas are cached, as they are on a server that has been up for a minute.
  if (prime) for (const code of ['EU', 'LCN', 'WLD', 'EAS']) await stats.statistics.get(code);
  return { ...stats, phases, profiles, service };
}

const phase = (overrides: Record<string, unknown>) =>
  createLivingPhaseRequest.parse({
    name: 'Home',
    city: 'City',
    countryCode: 'ES',
    tenure: 'RENT',
    startDate: '2022-09-01',
    currency: 'EUR',
    incomeStreams: salary(320000),
    fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 }],
    ...overrides,
  });

const first = async (service: BenchmarkService) => benchmarksResponse.parse(await service.benchmarks(USER, '2026-10-31')).phases;

describe('standing: country, continent and world', () => {
  it('places an income in the country, the EU and the world, in that order, each with its source', async () => {
    const { service, phases } = await setup();
    await phases.createPhase(USER, phase({}));

    const [result] = await first(service);

    expect(result.standing.map(({ scope, areaCode }) => [scope, areaCode])).toEqual([['COUNTRY', 'ES'], ['CONTINENT', 'EU'], ['WORLD', 'WLD']]);
    const [country, continent, worldRung] = result.standing;
    expect(country).toMatchObject({ percentile: 88.7, source: 'EUROSTAT', measuredAs: 'NATIONAL_INCOME', areaName: null, yourValue: null });
    // 38,400 euros a year per person: between the 8th decile (34,500) and the 9th (42,084).
    expect(continent).toMatchObject({ areaName: 'the EU', source: 'EUROSTAT', measuredAs: 'EURO_INCOME', basis: 'EQUIVALISED', period: '2025' });
    expect(continent.percentile).toBeCloseTo(85.1, 1);
    expect(continent.yourValue).toBe(38_400);
    // 3,200 a month / 30.44 days / 0.570991 PPP / 1.25 (dollar prices 2021 to 2025) = about 147 dollars a day.
    expect(worldRung).toMatchObject({ areaName: 'the world', source: 'WORLD_BANK', measuredAs: 'DOLLARS_PER_DAY_2021', basis: 'PER_CAPITA', period: '2024' });
    expect(worldRung.percentile).toBeCloseTo(97.9, 1);
    expect(worldRung.yourValue).toBeCloseTo(147.3, 1);
    expect(worldRung.citation).toMatchObject({ retrievedAt: '2026-10-31T12:00:00.000Z' });
    expect(worldRung.citation.url).toMatch(/^https:\/\//);
    expect(result.gaps).toEqual([]);
  });

  it('compares housing with the EU average too', async () => {
    const { service, phases } = await setup();
    await phases.createPhase(USER, phase({}));

    const [result] = await first(service);

    expect(result.continentHousing).toMatchObject({ areaCode: 'EU', areaName: 'the EU', yourSharePercent: 37.5, typicalSharePercent: 18.9, verdict: 'HIGHER', source: 'EUROSTAT' });
  });

  it('uses the World Bank region for someone living outside Europe, named as the data names it', async () => {
    const { service, phases } = await setup();
    await phases.createPhase(USER, phase({ countryCode: 'AR', currency: 'ARS', incomeStreams: salary(200_000_000), fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 40_000_000 }] }));

    const [result] = await first(service);
    const continent = result.standing.find(({ scope }) => scope === 'CONTINENT');

    expect(continent).toMatchObject({ areaCode: 'LCN', areaName: 'Latin America & the Caribbean', measuredAs: 'DOLLARS_PER_DAY_2021' });
    // 2,000,000 pesos / 30.44 / 567.3 / 1.25 = about 93 dollars a day: between 60 (90th) and 250 (99th).
    expect(continent!.percentile).toBeCloseTo(91.5, 0);
    expect(result.continentHousing).toBeNull();
  });

  it('keeps the other rungs and says why when the continent or the world has no reference', async () => {
    const { service, phases } = await setup({ ES: spain, AR: argentina, JP: japan, EU: eu });
    await phases.createPhase(USER, phase({}));
    await phases.createPhase(USER, phase({ name: 'Tokyo', countryCode: 'JP', currency: 'JPY', startDate: '2020-01-01', endDate: '2022-08-31', incomeStreams: salary(30_000_000) }));

    const [tokyo, madrid] = await first(service);

    expect(madrid.standing.map(({ scope }) => scope)).toEqual(['COUNTRY', 'CONTINENT']);
    expect(madrid.gaps).toContain('NO_WORLD_REFERENCE');
    expect(tokyo.standing).toEqual([]);
    expect(tokyo.gaps).toEqual(expect.arrayContaining(['NO_CONTINENT_REFERENCE', 'NO_WORLD_REFERENCE']));
  });

  it('has no continent for a country with no known region, and still places the income in the world', async () => {
    const { service, phases } = await setup({ ES: spain, AR: argentina, QQ: { purchasing: { source: 'WORLD_BANK', period: '2025', lcuPerInternationalDollar: 1, gniPerPersonDollars: null } }, WLD: world });
    await phases.createPhase(USER, phase({ countryCode: 'QQ', currency: 'USD', incomeStreams: salary(300_000) }));

    const [result] = await first(service);

    expect(result.standing.map(({ scope }) => scope)).toEqual(['WORLD']);
    expect(result.gaps).toContain('NO_CONTINENT_REFERENCE');
  });

  it('survives a world reference that could not be fetched', async () => {
    const { service, phases } = await setup({ ES: spain, EU: eu, WLD: new Error('down') });
    await phases.createPhase(USER, phase({}));

    const [result] = await first(service);

    expect(result.standing.map(({ scope }) => scope)).toEqual(['COUNTRY', 'CONTINENT']);
    expect(result.gaps).toContain('NO_WORLD_REFERENCE');
  });

  it('refuses to compare an income in a foreign currency without a rate, and converts it when there is one', async () => {
    const usdPhase = phase({ incomeStreams: salary(350_000), currency: 'USD' });
    const none = await setup();
    await none.phases.createPhase(USER, usdPhase);
    const [blocked] = await first(none.service);
    expect(blocked.standing).toEqual([]);
    expect(blocked.gaps).toContain('CURRENCY_MISMATCH');

    const fx: FxRateProvider = { ratesFor: async () => ({ rates: { EUR: 1, USD: 0.8 }, sources: {} }) };
    const converting = await setup(undefined, fx);
    await converting.phases.createPhase(USER, usdPhase);
    const [converted] = await first(converting.service);
    // 3,500 dollars is 2,800 euros: the same as an income in euros of that size.
    expect(converted.standing.map(({ scope }) => scope)).toEqual(['CONTINENT', 'WORLD']);
    expect(converted.standing[0].percentile).toBeLessThan(85.1);
  });

  it('takes the dollar price rise from the year of the PPP factor, not from the latest year', async () => {
    const older: StatisticsFragment = { ...spain, purchasing: { source: 'WORLD_BANK', period: '2024', lcuPerInternationalDollar: 0.570991, gniPerPersonDollars: null } };
    const { service, phases } = await setup({ ES: older, EU: eu, WLD: world });
    await phases.createPhase(USER, phase({}));

    const [result] = await first(service);

    // 1.2 instead of 1.25 gives about 153 dollars a day: a little higher up.
    expect(result.standing.find(({ scope }) => scope === 'WORLD')!.percentile).toBeCloseTo(98.1, 1);
  });

  it('leaves out the world when no purchasing power is known for the country', async () => {
    const { service, phases } = await setup({ ES: { ...spain, purchasing: null }, EU: eu, WLD: world });
    await phases.createPhase(USER, phase({}));

    const [result] = await first(service);

    expect(result.standing.map(({ scope }) => scope)).toEqual(['COUNTRY', 'CONTINENT']);
    expect(result.gaps).toContain('NO_PURCHASING_POWER');
  });

  it('shows no rung without income', async () => {
    const { service, phases } = await setup();
    await phases.createPhase(USER, phase({ incomeStreams: [] }));

    const [result] = await first(service);

    expect(result.standing).toEqual([]);
    expect(result.gaps).toEqual(['NO_INCOME']);
  });
});

describe('a person never waits for the reference areas', () => {
  it('answers at once without them, starts fetching them, and has them for the next request', async () => {
    const { service, phases, providers } = await setup(undefined, undefined, false);
    await phases.createPhase(USER, phase({}));

    const [early] = await first(service);
    expect(early.standing.map(({ scope }) => scope)).toEqual(['COUNTRY']);
    expect(early.gaps).toEqual(expect.arrayContaining(['NO_CONTINENT_REFERENCE', 'NO_WORLD_REFERENCE']));

    await new Promise((resolve) => setImmediate(resolve));
    expect(providers[0].fetch.mock.calls.map(([code]: [string]) => code)).toEqual(expect.arrayContaining(['EU', 'WLD']));

    const [later] = await first(service);
    expect(later.standing.map(({ scope }) => scope)).toEqual(['COUNTRY', 'CONTINENT', 'WORLD']);
  });
});

describe('reference areas refresh about every six months', () => {
  const lock: JobLock = { runExclusive: async (_name, task) => (await task(), 'ran') };

  it('fetches the EU, the region and the world once for everybody, along with the countries in use', async () => {
    const stats = world_();
    await new BenchmarkRefresher({ statistics: stats.statistics, lock, countriesInUse: async () => ['ES', 'AR', 'ES'] }).run();

    const asked = stats.providers[0].fetch.mock.calls.map(([code]: [string]) => code).sort();
    expect(asked).toEqual(['AR', 'EU', 'ES', 'LCN', 'WLD'].sort());
  });

  it('leaves an area alone for six months, while a country is refreshed after 35 days', async () => {
    const stats = world_();
    const refresher = new BenchmarkRefresher({ statistics: stats.statistics, lock, countriesInUse: async () => ['ES'] });
    await refresher.run();
    stats.providers[0].fetch.mockClear();

    stats.clock.now += 40 * DAY;
    await refresher.run();
    expect(stats.providers[0].fetch.mock.calls.map(([code]: [string]) => code)).toEqual(['ES']);

    stats.providers[0].fetch.mockClear();
    stats.clock.now += 150 * DAY;
    await refresher.run();
    expect(stats.providers[0].fetch.mock.calls.map(([code]: [string]) => code).sort()).toEqual(['ES', 'EU', 'WLD']);
  });

  it('never replaces a good reference with an outage', async () => {
    const answers: Record<string, StatisticsFragment | Error> = { ES: spain, EU: eu, WLD: world };
    const stats = world_(answers);
    await stats.statistics.get('WLD');
    stats.providers[0].fetch.mockRejectedValueOnce(new Error('down'));
    stats.clock.now += 200 * DAY;

    const kept = await stats.statistics.get('WLD');

    expect(kept?.statistics.referenceDistribution?.period).toBe('2024');
    expect(kept?.fetchedAt).toBe('2026-10-31T12:00:00.000Z');
  });
});
