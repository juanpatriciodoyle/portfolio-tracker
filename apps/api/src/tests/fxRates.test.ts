import { readFileSync } from 'fs';
import { join } from 'path';
import { BcraOfficialRateSource } from '../infrastructure/fx/bcraOfficialRates';
import { FrankfurterFxRateProvider } from '../infrastructure/fx/frankfurterFxRates';
import { LiveFxRateProvider } from '../infrastructure/fx/liveFxRateProvider';
import { REFERENCE_EUR_RATES, ReferenceFxRateProvider } from '../infrastructure/fx/referenceFxRates';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'fx', name), 'utf8');
const reply = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });

/** A fetch stand-in that answers by URL and remembers what was asked. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!route) throw new Error(`unexpected request ${url}`);
    return routes[route]();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const ECB = 'https://api.frankfurter.dev/v1/';
const BCRA = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/5';
const usdInEur = 1 / 1.1172;
const gbpInEur = 1 / 0.8338;

describe('ReferenceFxRateProvider', () => {
  it('knows the built-in approximate rates, and says they are only a reference', async () => {
    const quote = await new ReferenceFxRateProvider().ratesFor(['EUR', 'USD', 'ARS'], '2026-10-31');

    expect(quote.rates).toEqual({ EUR: 1, USD: REFERENCE_EUR_RATES.USD });
    expect(quote.sources).toEqual({ USD: 'REFERENCE' });
  });
});

describe('FrankfurterFxRateProvider (ECB rates)', () => {
  it('turns "units per euro" into "value of one unit in euros"', async () => {
    const { fetchFn, calls } = fakeFetch({ [ECB]: () => reply(fixture('frankfurter-latest.json')) });

    const quote = await new FrankfurterFxRateProvider(fetchFn).ratesFor(['EUR', 'USD', 'GBP'], '2026-10-31');

    expect(quote.rates.EUR).toBe(1);
    expect(quote.rates.USD).toBeCloseTo(usdInEur, 10);
    expect(quote.rates.GBP).toBeCloseTo(gbpInEur, 10);
    expect(quote.sources).toEqual({ USD: 'ECB', GBP: 'ECB' });
    expect(calls).toEqual([`${ECB}2026-10-31?base=EUR&symbols=GBP,USD`]);
  });

  it('asks for a historical day when given one', async () => {
    const { fetchFn, calls } = fakeFetch({ [ECB]: () => reply(fixture('frankfurter-2024-03-15.json')) });

    const quote = await new FrankfurterFxRateProvider(fetchFn).ratesFor(['CHF'], '2024-03-15');

    expect(quote.rates.CHF).toBeCloseTo(1 / 0.9613, 10);
    expect(calls[0]).toContain('/2024-03-15?');
  });

  it('does not call the network for euros alone, and leaves out currencies the ECB does not publish', async () => {
    const { fetchFn, calls } = fakeFetch({ [ECB]: () => reply(fixture('frankfurter-latest.json')) });
    const provider = new FrankfurterFxRateProvider(fetchFn);

    expect((await provider.ratesFor(['EUR'], '2026-10-31')).rates).toEqual({ EUR: 1 });
    expect(calls).toEqual([]);
    expect(Object.keys((await provider.ratesFor(['USD', 'ARS'], '2026-10-31')).rates).sort()).toEqual(['EUR', 'USD']);
  });

  it.each([
    ['an HTTP error', () => reply('boom', 500)],
    ['a body that is not JSON', () => reply('<html>')],
    ['a body of the wrong shape', () => reply('{"rates":"nope"}')],
  ])('fails clearly on %s', async (_label, answer) => {
    const { fetchFn } = fakeFetch({ [ECB]: answer });

    await expect(new FrankfurterFxRateProvider(fetchFn).ratesFor(['USD'], '2026-10-31')).rejects.toThrow();
  });
});

describe('BcraOfficialRateSource', () => {
  it('reads the official wholesale rate (pesos per dollar) for the newest day up to the one asked', async () => {
    const { fetchFn, calls } = fakeFetch({ [BCRA]: () => reply(fixture('bcra-variable-5.json')) });
    const source = new BcraOfficialRateSource(fetchFn);

    expect(await source.pesosPerDollar('2026-10-30')).toBeCloseTo(1537.3487, 4);
    expect(await source.pesosPerDollar('2026-10-28')).toBeCloseTo(1538.4739, 4);
    expect(calls[0]).toContain('desde=2026-10-20&hasta=2026-10-30');
  });

  it('fails when the bank has nothing for those days or answers with an error', async () => {
    const empty = fakeFetch({ [BCRA]: () => reply('{"status":200,"results":[{"idVariable":5,"detalle":[]}]}') });
    const down = fakeFetch({ [BCRA]: () => reply('{"status":410}', 410) });

    await expect(new BcraOfficialRateSource(empty.fetchFn).pesosPerDollar('2026-10-30')).rejects.toThrow();
    await expect(new BcraOfficialRateSource(down.fetchFn).pesosPerDollar('2026-10-30')).rejects.toThrow();
    await expect(new BcraOfficialRateSource(fakeFetch({ [BCRA]: () => reply(fixture('bcra-variable-5.json')) }).fetchFn).pesosPerDollar('2026-10-01')).rejects.toThrow();
  });
});

describe('LiveFxRateProvider', () => {
  const live = (routes: Parameters<typeof fakeFetch>[0]) => {
    const { fetchFn, calls } = fakeFetch(routes);
    const provider = new LiveFxRateProvider({
      ecb: new FrankfurterFxRateProvider(fetchFn),
      bcra: new BcraOfficialRateSource(fetchFn),
      reference: new ReferenceFxRateProvider(),
    });
    return { provider, calls };
  };
  const working = { [ECB]: () => reply(fixture('frankfurter-latest.json')), [BCRA]: () => reply(fixture('bcra-variable-5.json')) };

  it('prices Argentine pesos at the official BCRA rate, through the ECB dollar', async () => {
    const { provider } = live(working);

    const quote = await provider.ratesFor(['EUR', 'ARS'], '2026-10-30');

    expect(quote.rates.ARS).toBeCloseTo(usdInEur / 1537.3487, 12);
    expect(quote.sources).toEqual({ ARS: 'BCRA_OFFICIAL' });
    expect(Object.keys(quote.rates).sort()).toEqual(['ARS', 'EUR']); // the dollar was only a stepping stone
  });

  it('mixes sources when several currencies are asked for', async () => {
    const quote = await live(working).provider.ratesFor(['USD', 'ARS', 'GBP'], '2026-10-30');

    expect(quote.sources).toEqual({ USD: 'ECB', GBP: 'ECB', ARS: 'BCRA_OFFICIAL' });
  });

  it('falls back to the reference table when the ECB is down, and then has no pesos at all', async () => {
    const { provider } = live({ ...working, [ECB]: () => reply('down', 503) });

    const quote = await provider.ratesFor(['USD', 'ARS'], '2026-10-30');

    expect(quote.rates).toEqual({ EUR: 1, USD: REFERENCE_EUR_RATES.USD });
    expect(quote.sources).toEqual({ USD: 'REFERENCE' });
  });

  it('keeps the ECB rates when only the bank is down', async () => {
    const { provider } = live({ ...working, [BCRA]: () => reply('down', 503) });

    const quote = await provider.ratesFor(['USD', 'ARS'], '2026-10-30');

    expect(quote.sources).toEqual({ USD: 'ECB' });
    expect(quote.rates.ARS).toBeUndefined();
  });

  it('survives a request that never answers', async () => {
    const { provider } = live({ ...working, [ECB]: () => Promise.reject(new DOMException('timed out', 'TimeoutError')) });

    expect((await provider.ratesFor(['USD'], '2026-10-30')).sources).toEqual({ USD: 'REFERENCE' });
  });

  it('asks the network once per day and currency set', async () => {
    const { provider, calls } = live(working);

    await provider.ratesFor(['USD', 'ARS'], '2026-10-30');
    await provider.ratesFor(['ARS', 'USD'], '2026-10-30');
    const afterCache = calls.length;
    await provider.ratesFor(['USD', 'ARS'], '2026-10-29');

    expect(afterCache).toBe(2); // one ECB call and one BCRA call
    expect(calls.length).toBeGreaterThan(afterCache);
  });

  it('does not cache a failure for the rest of the day', async () => {
    let healthy = false;
    const { provider } = live({
      ...working,
      [ECB]: () => (healthy ? reply(fixture('frankfurter-latest.json')) : reply('down', 503)),
    });

    expect((await provider.ratesFor(['USD'], '2026-10-30')).sources.USD).toBe('REFERENCE');
    healthy = true;
    expect((await provider.ratesFor(['USD'], '2026-10-30')).sources.USD).toBe('ECB');
  });
});
