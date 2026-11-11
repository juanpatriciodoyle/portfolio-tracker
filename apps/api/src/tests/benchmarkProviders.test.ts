import { readFileSync } from 'fs';
import { join } from 'path';
import { EurostatStatisticsProvider } from '../infrastructure/benchmarks/eurostatStatistics';
import { IndecStatisticsProvider } from '../infrastructure/benchmarks/indecStatistics';
import { WorldBankStatisticsProvider } from '../infrastructure/benchmarks/worldBankStatistics';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'benchmarks', name), 'utf8');
const reply = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!route) throw new Error(`unexpected request ${url}`);
    return routes[route]();
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('EurostatStatisticsProvider', () => {
  const routes = () => ({
    'ilc_di01': () => reply(fixture('eurostat-ilc_di01-ES.json')),
    'ilc_mded01': () => reply(fixture('eurostat-ilc_mded01-ES.json')),
  });

  it('supports the countries Eurostat surveys, and nobody else', () => {
    const provider = new EurostatStatisticsProvider(fakeFetch({}).fetchFn);

    expect(provider.supports('ES')).toBe(true);
    expect(provider.supports('GR')).toBe(true);
    expect(provider.supports('PL')).toBe(true);
    expect(provider.supports('AR')).toBe(false);
    expect(provider.supports('US')).toBe(false);
  });

  it('turns the decile cut-offs into a distribution of annual equivalised income in minor units, and reads the housing share', async () => {
    const { fetchFn, calls } = fakeFetch(routes());

    const fragment = await new EurostatStatisticsProvider(fetchFn).fetch('ES');

    expect(fragment.incomeDistribution).toEqual({
      source: 'EUROSTAT',
      period: '2025',
      currency: 'EUR',
      distribution: {
        period: 'YEAR',
        basis: 'EQUIVALISED',
        points: [9091, 12374, 15130, 17742, 20367, 23372, 26791, 31569, 39385].map((euros, index) => ({ percentile: (index + 1) * 10, value: euros * 100 })),
      },
    });
    expect(fragment.housingCostShare).toEqual({ source: 'EUROSTAT', period: '2025', percent: 16 });
    expect(calls.find((url) => url.includes('ilc_di01'))).toContain('geo=ES');
    expect(calls.find((url) => url.includes('ilc_di01'))).toContain('unit=NAC');
  });

  it('also publishes the EU as a whole, in euros', async () => {
    const { fetchFn, calls } = fakeFetch(routes());
    const provider = new EurostatStatisticsProvider(fetchFn);

    expect(provider.supports('EU')).toBe(true);
    const fragment = await provider.fetch('EU');

    expect(fragment.incomeDistribution).toMatchObject({ source: 'EUROSTAT', currency: 'EUR', distribution: { period: 'YEAR', basis: 'EQUIVALISED' } });
    expect(calls.every((url) => url.includes('geo=EU27_2020'))).toBe(true);
    expect(calls.find((url) => url.includes('ilc_di01'))).toContain('unit=EUR');
  });

  it('asks Eurostat for Greece as EL', async () => {
    const { fetchFn, calls } = fakeFetch(routes());

    await new EurostatStatisticsProvider(fetchFn).fetch('GR');

    expect(calls.every((url) => url.includes('geo=EL'))).toBe(true);
  });

  it('answers nothing for a country the dataset has no figures for', async () => {
    const { fetchFn } = fakeFetch({
      ilc_di01: () => reply(fixture('eurostat-unknown-geo.json')),
      ilc_mded01: () => reply(fixture('eurostat-unknown-geo.json')),
    });

    expect(await new EurostatStatisticsProvider(fetchFn).fetch('ES')).toEqual({});
  });

  it('keeps what it could read when one of the two datasets fails', async () => {
    const { fetchFn } = fakeFetch({ ilc_di01: () => reply('oops', 503), ilc_mded01: () => reply(fixture('eurostat-ilc_mded01-ES.json')) });

    const fragment = await new EurostatStatisticsProvider(fetchFn).fetch('ES');

    expect(fragment.incomeDistribution).toBeUndefined();
    expect(fragment.housingCostShare?.percent).toBe(16);
  });

  it('fails when nothing could be read, so the caller does not cache an outage as "no data"', async () => {
    const { fetchFn } = fakeFetch({ ilc_di01: () => reply('oops', 503), ilc_mded01: () => reply('oops', 500) });

    await expect(new EurostatStatisticsProvider(fetchFn).fetch('ES')).rejects.toThrow();
  });

  it('treats a malformed answer as a failure rather than as data', async () => {
    const { fetchFn } = fakeFetch({ ilc_di01: () => reply('{"nonsense":true}'), ilc_mded01: () => reply('not json') });

    await expect(new EurostatStatisticsProvider(fetchFn).fetch('ES')).rejects.toThrow();
  });
});

describe('IndecStatisticsProvider', () => {
  const route = { 'apis.datos.gob.ar/series': () => reply(fixture('indec-deciles.json')) };

  it('supports Argentina only', () => {
    const provider = new IndecStatisticsProvider(fakeFetch({}).fetchFn);

    expect(provider.supports('AR')).toBe(true);
    expect(provider.supports('ES')).toBe(false);
  });

  it('reads the latest quarter with figures, as monthly per-person income at the middle of each decile', async () => {
    const fragment = await new IndecStatisticsProvider(fakeFetch(route).fetchFn).fetch('AR');

    expect(fragment.incomeDistribution).toEqual({
      source: 'INDEC',
      period: '2026-Q1',
      currency: 'ARS',
      distribution: {
        period: 'MONTH',
        basis: 'PER_CAPITA',
        points: [308588, 382238, 461506, 554804, 679991, 882599, 1209872, 2435937].map((pesos, index) => ({ percentile: 25 + index * 10, value: pesos * 100 })),
      },
    });
    expect(fragment.housingCostShare).toBeUndefined();
  });

  it('skips a quarter that is mostly empty', async () => {
    const sparse = JSON.stringify({ data: [['2026-04-01', null, null, null, null, 5, null, null, null, null, null], ...JSON.parse(fixture('indec-deciles.json')).data.slice(1)] });
    const fragment = await new IndecStatisticsProvider(fakeFetch({ 'apis.datos.gob.ar': () => reply(sparse) }).fetchFn).fetch('AR');

    expect(fragment.incomeDistribution?.period).toBe('2025-Q4');
  });

  it('answers nothing when no quarter has enough figures, and fails on an outage', async () => {
    const empty = JSON.stringify({ data: [['2026-01-01', null, null, null, null, null, null, null, null, null, 1]] });

    expect(await new IndecStatisticsProvider(fakeFetch({ 'apis.datos.gob.ar': () => reply(empty) }).fetchFn).fetch('AR')).toEqual({});
    await expect(new IndecStatisticsProvider(fakeFetch({ 'apis.datos.gob.ar': () => reply('x', 500) }).fetchFn).fetch('AR')).rejects.toThrow();
  });
});

describe('WorldBankStatisticsProvider', () => {
  const routes = () => ({
    'PA.NUS.PPP': () => reply(fixture('worldbank-ppp.json')),
    'NY.GNP.PCAP.PP.CD': () => reply(fixture('worldbank-gni-ppp.json')),
  });

  it('supports any country', () => {
    const provider = new WorldBankStatisticsProvider(fakeFetch({}).fetchFn);

    expect(provider.supports('AR')).toBe(true);
    expect(provider.supports('JP')).toBe(true);
    expect(provider.supports('xx')).toBe(false);
  });

  it('reads the PPP conversion factor and GNI per person for the country asked about', async () => {
    const { fetchFn, calls } = fakeFetch(routes());

    expect((await new WorldBankStatisticsProvider(fetchFn).fetch('AR')).purchasing).toEqual({
      source: 'WORLD_BANK',
      period: '2025',
      lcuPerInternationalDollar: 567.297421343424,
      gniPerPersonDollars: 31920,
    });
    expect((await new WorldBankStatisticsProvider(fetchFn).fetch('ES')).purchasing).toMatchObject({ lcuPerInternationalDollar: 0.570991, gniPerPersonDollars: 59830 });
    expect(calls[0]).toContain('country/AR/');
  });

  it('reads the World Bank region of the country, so it can be compared with its continent', async () => {
    const region = JSON.stringify([{ page: 1 }, [{ id: 'ARG', iso2Code: 'AR', region: { id: 'LCN', value: 'Latin America & Caribbean ' } }]]);
    const { fetchFn, calls } = fakeFetch({ ...routes(), 'country/AR?format=json': () => reply(region) });

    expect((await new WorldBankStatisticsProvider(fetchFn).fetch('AR')).regionCode).toBe('LCN');
    expect(calls.some((url) => url.endsWith('country/AR?format=json'))).toBe(true);
  });

  it('leaves the region out when it is not a known region, or when that request fails', async () => {
    const aggregate = JSON.stringify([{ page: 1 }, [{ id: 'XYZ', iso2Code: 'XY', region: { id: 'NA', value: 'Aggregates' } }]]);

    expect((await new WorldBankStatisticsProvider(fakeFetch({ ...routes(), 'country/AR?format=json': () => reply(aggregate) }).fetchFn).fetch('AR')).regionCode).toBeUndefined();
    expect((await new WorldBankStatisticsProvider(fakeFetch({ ...routes(), 'country/AR?format=json': () => reply('x', 500) }).fetchFn).fetch('AR')).purchasing).toBeDefined();
  });

  it('does not take the EU for a country', () => {
    expect(new WorldBankStatisticsProvider(fakeFetch({}).fetchFn).supports('EU')).toBe(false);
  });

  it('still gives the PPP factor when GNI is missing', async () => {
    const { fetchFn } = fakeFetch({ 'PA.NUS.PPP': routes()['PA.NUS.PPP'], 'NY.GNP.PCAP.PP.CD': () => reply('x', 500) });

    expect((await new WorldBankStatisticsProvider(fetchFn).fetch('AR')).purchasing).toMatchObject({ lcuPerInternationalDollar: 567.297421343424, gniPerPersonDollars: null });
  });

  it('answers nothing for a country without a figure or an error message from the API', async () => {
    const message = JSON.stringify([{ message: [{ id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid' }] }]);
    const none = JSON.stringify([{ page: 1 }, [{ country: { id: 'JP' }, date: '2024', value: null }]]);

    expect(await new WorldBankStatisticsProvider(fakeFetch({ 'PA.NUS.PPP': () => reply(message), 'NY.GNP': () => reply(message) }).fetchFn).fetch('QQ')).toEqual({});
    expect(await new WorldBankStatisticsProvider(fakeFetch({ 'PA.NUS.PPP': () => reply(none), 'NY.GNP': () => reply(none) }).fetchFn).fetch('JP')).toEqual({});
  });

  it('refuses a factor that is not a positive number, and fails when the PPP request fails', async () => {
    const bad = JSON.stringify([{ page: 1 }, [{ country: { id: 'AR' }, date: '2025', value: -3 }]]);

    expect(await new WorldBankStatisticsProvider(fakeFetch({ 'PA.NUS.PPP': () => reply(bad), 'NY.GNP': () => reply(bad) }).fetchFn).fetch('AR')).toEqual({});
    await expect(new WorldBankStatisticsProvider(fakeFetch({ 'PA.NUS.PPP': () => reply('x', 500), 'NY.GNP': () => reply('x', 500) }).fetchFn).fetch('AR')).rejects.toThrow();
  });
});
