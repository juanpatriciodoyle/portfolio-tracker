import {
  compareShare,
  housingCostsMinor,
  housingShare,
  incomePercentile,
  incomePerPerson,
  internationalDollars,
  ratioOf,
  type IncomeDistribution,
} from '../domain/benchmarks';

// Spain, annual equivalised net income, euros as cents: D1..D9 cut-offs (Eurostat ilc_di01, 2025).
const spain: IncomeDistribution = {
  period: 'YEAR',
  basis: 'EQUIVALISED',
  points: [9091, 12374, 15130, 17742, 20367, 23372, 26791, 31569, 39385].map((euros, index) => ({ percentile: (index + 1) * 10, value: euros * 100 })),
};

// Argentina, monthly per-capita family income, mean of each decile (INDEC), only deciles 3..10 published.
const argentina: IncomeDistribution = {
  period: 'MONTH',
  basis: 'PER_CAPITA',
  points: [308588, 382238, 461506, 554804, 679991, 882599, 1209872, 2435937].map((pesos, index) => ({ percentile: 25 + index * 10, value: pesos * 100 })),
};

const single = { adults: 1, children: 0 };

describe('incomePerPerson', () => {
  it('shares a per-capita income over everyone in the household', () => {
    expect(incomePerPerson(900000, { adults: 2, children: 1 }, 'PER_CAPITA')).toBe(300000);
  });

  it('uses the modified OECD scale (1, 0.5 per further adult, 0.3 per child) when equivalised', () => {
    expect(incomePerPerson(320000, single, 'EQUIVALISED')).toBe(320000);
    expect(incomePerPerson(380000, { adults: 2, children: 0 }, 'EQUIVALISED')).toBe(253333);
    expect(incomePerPerson(460000, { adults: 2, children: 2 }, 'EQUIVALISED')).toBe(Math.round(460000 / 2.1));
  });
});

describe('incomePercentile', () => {
  it('interpolates between published points', () => {
    // 3 200 EUR a month on its own: 38 400 a year, between D8 (31 569) and D9 (39 385)
    expect(incomePercentile(spain, 320000, single)).toEqual({ percentile: 88.7, bound: 'EXACT' });
  });

  it('puts an income exactly on a point at that percentile', () => {
    // 20 367 EUR a year is 1 697.25 EUR a month
    expect(incomePercentile(spain, 169725, single)).toEqual({ percentile: 50, bound: 'EXACT' });
  });

  it('counts a household by its size: the same income is lower down for a bigger household', () => {
    const alone = incomePercentile(spain, 320000, single)!;
    const family = incomePercentile(spain, 320000, { adults: 2, children: 2 })!;

    expect(family.percentile).toBeLessThan(alone.percentile);
  });

  it('only says "at least" above the last point and "at most" below the first', () => {
    expect(incomePercentile(spain, 1_000_000, single)).toEqual({ percentile: 90, bound: 'AT_LEAST' });
    expect(incomePercentile(spain, 50_000, single)).toEqual({ percentile: 10, bound: 'AT_MOST' });
    expect(incomePercentile(spain, 0, single)).toEqual({ percentile: 10, bound: 'AT_MOST' });
  });

  it('reads a monthly per-capita distribution', () => {
    expect(incomePercentile(argentina, 67_999_100, single)).toEqual({ percentile: 65, bound: 'EXACT' });
    expect(incomePercentile(argentina, 10_000_000, single)).toEqual({ percentile: 25, bound: 'AT_MOST' });
    expect(incomePercentile(argentina, 500_000_000, single)).toEqual({ percentile: 95, bound: 'AT_LEAST' });
  });

  it('answers nothing without a distribution', () => {
    expect(incomePercentile({ period: 'YEAR', basis: 'EQUIVALISED', points: [] }, 320000, single)).toBeNull();
  });

  it('never goes backwards: more income is never a lower percentile', () => {
    let previous = 0;
    for (let income = 0; income <= 700000; income += 25000) {
      const { percentile } = incomePercentile(spain, income, single)!;
      expect(percentile).toBeGreaterThanOrEqual(previous);
      previous = percentile;
    }
  });
});

describe('housing costs and their share of income', () => {
  const byCategory = { RENT: 120000, ELECTRICITY: 9600, GAS: 4000, WATER: 2500, INTERNET: 4000, PHONE: 3000, SUBSCRIPTIONS: 1500, TAXES: 1000, OTHER: 700 };

  it('counts rent, electricity, gas, water and property taxes, not internet, phone or subscriptions', () => {
    expect(housingCostsMinor(byCategory)).toBe(120000 + 9600 + 4000 + 2500 + 1000);
  });

  it('is a percentage of income with one decimal, or nothing without income', () => {
    expect(housingShare(137100, 320000)).toBe(42.8);
    expect(housingShare(0, 320000)).toBe(0);
    expect(housingShare(137100, 0)).toBeNull();
  });

  it('compares with the typical share, calling anything within 2 points similar', () => {
    expect(compareShare(42.8, 16)).toEqual({ differencePoints: 26.8, verdict: 'HIGHER' });
    expect(compareShare(10.2, 16)).toEqual({ differencePoints: -5.8, verdict: 'LOWER' });
    expect(compareShare(17.9, 16)).toEqual({ differencePoints: 1.9, verdict: 'SIMILAR' });
    expect(compareShare(14, 16)).toEqual({ differencePoints: -2, verdict: 'SIMILAR' });
  });
});

describe('purchasing power', () => {
  it('converts minor units to international dollars with the PPP factor of the country', () => {
    // 3 200 EUR at 0.570991 EUR per international dollar
    expect(internationalDollars(320000, 'EUR', 0.570991)).toBe(5604.29);
    // 2 000 000 ARS at 567.297 ARS per international dollar
    expect(internationalDollars(200000000, 'ARS', 567.297421343424)).toBe(3525.49);
  });

  it('knows currencies without minor units', () => {
    expect(internationalDollars(300000, 'JPY', 100)).toBe(3000);
  });

  it('refuses a factor that is not a positive number', () => {
    expect(internationalDollars(320000, 'EUR', 0)).toBeNull();
    expect(internationalDollars(320000, 'EUR', Number.NaN)).toBeNull();
    expect(internationalDollars(320000, 'EUR', -1)).toBeNull();
  });

  it('compares two amounts as a ratio with two decimals', () => {
    expect(ratioOf(5604.29, 3525.49)).toBe(1.59);
    expect(ratioOf(1, 0)).toBeNull();
    expect(ratioOf(0, 5)).toBe(0);
  });
});
