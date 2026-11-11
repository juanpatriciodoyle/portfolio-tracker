import { WorldBankPipStatisticsProvider } from '../infrastructure/benchmarks/worldBankPipStatistics';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake World Bank where a person at `d` dollars a day sits above a share of people that rises with d. */
function fakePip(options: { failOn?: string; lastActualYear?: number } = {}) {
  const calls: string[] = [];
  const lastActual = options.lastActualYear ?? 2024;
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (options.failOn && url.includes(options.failOn)) return reply({}, 500);
    if (url.includes('FP.CPI.TOTL')) {
      return reply([{ page: 1 }, [{ date: '2024', value: 150 }, { date: '2023', value: 140 }, { date: '2022', value: 130 }, { date: '2021', value: 120 }]]);
    }
    const params = new URL(url).searchParams;
    if (params.get('year') === 'all') {
      return reply([
        { region_code: 'WLD', region_name: 'World', reporting_year: lastActual - 1, headcount: 0.8, estimate_type: 'actual' },
        { region_code: 'WLD', region_name: 'World', reporting_year: lastActual, headcount: 0.8, estimate_type: 'actual' },
        { region_code: 'WLD', region_name: 'World', reporting_year: lastActual + 1, headcount: 0.8, estimate_type: 'nowcast' },
      ]);
    }
    const line = Number(params.get('povline'));
    const headcount = Math.min(1, line / 100);
    return reply([{ region_code: 'WLD', region_name: 'World', reporting_year: Number(params.get('year')), poverty_line: line, headcount, estimate_type: 'actual' }]);
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('WorldBankPipStatisticsProvider', () => {
  it('supports the world and the World Bank regions, and nothing else', () => {
    const provider = new WorldBankPipStatisticsProvider(fakePip().fetchFn);
    for (const code of ['WLD', 'LCN', 'NAC', 'ECS', 'EAS', 'SAS', 'MEA', 'SSF']) expect(provider.supports(code)).toBe(true);
    for (const code of ['ES', 'EU', 'AR', 'XYZ']) expect(provider.supports(code)).toBe(false);
  });

  it('reads the latest year with real survey data, not a forecast, at the 2021 PPP round', async () => {
    const { fetchFn, calls } = fakePip({ lastActualYear: 2024 });

    const fragment = await new WorldBankPipStatisticsProvider(fetchFn).fetch('WLD');

    expect(fragment.referenceDistribution).toMatchObject({ source: 'WORLD_BANK', period: '2024', areaName: 'World' });
    const distribution = calls.filter((url) => url.includes('/pip-grp') && !url.includes('year=all'));
    expect(distribution.length).toBeGreaterThan(10);
    for (const url of distribution) {
      expect(url).toContain('year=2024');
      expect(url).toContain('ppp_version=2021');
      expect(url).toContain('country=WLD');
    }
  });

  it('turns the share of people below each line into ascending percentile points, stopping when everybody is below', async () => {
    const fragment = await new WorldBankPipStatisticsProvider(fakePip().fetchFn).fetch('WLD');

    const points = fragment.referenceDistribution!.points;
    expect(points.length).toBeGreaterThan(8);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].value).toBeGreaterThan(points[i - 1].value);
      expect(points[i].percentile).toBeGreaterThan(points[i - 1].percentile);
    }
    // 30 dollars a day: 30% of people in this fake world are below.
    expect(points.find((point) => point.value === 30)).toEqual({ percentile: 30, value: 30 });
    expect(points[points.length - 1].percentile).toBeLessThanOrEqual(100);
  });

  it('records how much dollar prices rose since 2021, to bring a current income to the distribution\'s prices', async () => {
    const fragment = await new WorldBankPipStatisticsProvider(fakePip().fetchFn).fetch('WLD');

    expect(fragment.referenceDistribution!.priceIndex).toEqual({ '2021': 1, '2022': 130 / 120, '2023': 140 / 120, '2024': 150 / 120 });
  });

  it('throws on an outage instead of publishing half a distribution', async () => {
    await expect(new WorldBankPipStatisticsProvider(fakePip({ failOn: 'povline=30&' }).fetchFn).fetch('WLD')).rejects.toThrow();
  });

  it('throws when the World Bank has no real survey year', async () => {
    const fetchFn = (async () => reply([{ region_code: 'WLD', region_name: 'World', reporting_year: 2026, headcount: 0.8, estimate_type: 'nowcast' }])) as typeof fetch;
    await expect(new WorldBankPipStatisticsProvider(fetchFn).fetch('WLD')).rejects.toThrow();
  });
});
