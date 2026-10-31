import {
  FALLBACK_ANNUAL_INFLATION_PERCENT,
  defaultAnnualInflationPercent,
  holdingPeriodInflationPercent,
  inflationLossAmount,
} from '../domain/inflation';

// Guard rails: the domain maths must stay offline and clock-free. If it ever reaches for Prisma
// or the network, these fail loudly instead of quietly depending on the environment.
jest.mock('@prisma/client', () => {
  throw new Error('inflation domain tests must not load Prisma');
});

type Rates = Record<number, number>;

const utc = (year: number, month: number, day = 1, hour = 0) => new Date(Date.UTC(year, month - 1, day, hour));

const inflation = (
  annualRates: Rates,
  start: Date,
  end: Date,
  fallbackAnnualRate = FALLBACK_ANNUAL_INFLATION_PERCENT
) => holdingPeriodInflationPercent({ annualRates, fallbackAnnualRate, start, end });

// Realistic annual CPI fixtures (percent); only their shape matters, not the exact figures.
const SPAIN: Rates = { 2021: 3.1, 2022: 8.4, 2023: 3.5, 2024: 2.8 };
const GERMANY: Rates = { 2020: 0.5, 2021: 3.1, 2022: 6.9, 2023: 5.9, 2024: 2.2 };

beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('inflation domain tests must not use the network');
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('holdingPeriodInflationPercent', () => {
  describe('inside a single calendar year (pro rata, 30.44-day months, one-month minimum)', () => {
    it.each<[string, Rates, Date, Date, number]>([
      ['six months at 2.8%', { 2024: 2.8 }, utc(2024, 1, 1), utc(2024, 7, 1), 1.4],
      ['rounds to one decimal (1.4947% -> 1.5)', { 2024: 3 }, utc(2024, 1, 1), utc(2024, 7, 1), 1.5],
      ['a full year at 12% (365 days = 11.99 months)', { 2024: 12 }, utc(2024, 1, 1), utc(2024, 12, 31), 12],
      ['a few days is floored to one month', { 2024: 12 }, utc(2024, 3, 10), utc(2024, 3, 12), 1],
      ['zero length is floored to one month', { 2024: 12 }, utc(2024, 3, 10), utc(2024, 3, 10), 1],
      ['leap day + 29 days is still under a month', { 2024: 12 }, utc(2024, 2, 29), utc(2024, 3, 29), 1],
      ['uses only that year, not its neighbours', { 2023: 50, 2024: 6, 2025: 50 }, utc(2024, 1, 1), utc(2024, 7, 1), 3],
    ])('%s', (_label, rates, start, end, expected) => {
      expect(inflation(rates, start, end)).toBe(expected);
    });
  });

  describe('across several years (partial first and last year, whole years in between compound)', () => {
    it.each<[string, Rates, Date, Date, number]>([
      // 2021: Apr-Dec = 9 months -> 1.0225; 2022: 1.06; 2023: 1.04; 2024: Jan-Jun = 6 months -> 1.01
      ['worked example, 2021-04 to 2024-06', { 2021: 3, 2022: 6, 2023: 4, 2024: 2 }, utc(2021, 4, 15), utc(2024, 6, 30), 13.8],
      // 2023: Nov-Dec = 2 months -> 1.01; 2024: Jan-Feb = 2 months -> 1.006
      ['adjacent years, 2023-11 to 2024-02', { 2023: 6, 2024: 3.6 }, utc(2023, 11, 15), utc(2024, 2, 10), 1.6],
      ['january start and december end count whole years', { 2022: 5, 2023: 6 }, utc(2022, 1, 1), utc(2023, 12, 31), 11.3],
      // 2023: Dec = 1 month -> 1.01; 2024: Jan-Mar = 3 months -> 1.015 (a local-time reading would see 2024-01-01 here)
      ['23:00 UTC on 31 December still belongs to that year', { 2023: 12, 2024: 6 }, utc(2023, 12, 31, 23), utc(2024, 3, 1), 2.5],
      ['triple-digit annual rates compound (Argentina scale)', { 2023: 211.4, 2024: 117.8 }, utc(2023, 1, 1), utc(2024, 12, 31), 578.2],
    ])('%s', (_label, rates, start, end, expected) => {
      expect(inflation(rates, start, end)).toBe(expected);
    });
  });

  describe('missing, zero and negative rates', () => {
    it('applies the fallback rate to years absent from the rates', () => {
      expect(inflation({}, utc(2022, 1, 1), utc(2023, 12, 31), 4)).toBe(8.2); // 1.04 x 1.04 = 1.0816
    });

    it('prefers a supplied rate over the fallback', () => {
      expect(inflation({ 2022: 10 }, utc(2022, 1, 1), utc(2023, 12, 31), 4)).toBe(14.4); // 1.10 x 1.04
    });

    it('honours an explicit 0% instead of replacing it with the fallback', () => {
      expect(inflation({ 2024: 0 }, utc(2024, 1, 1), utc(2024, 7, 1), 5)).toBe(0);
    });

    it('lets deflation (negative rates) reduce the total', () => {
      expect(inflation({ 2024: -1.2 }, utc(2024, 1, 1), utc(2024, 12, 31))).toBe(-1.2);
    });
  });

  describe('degenerate ranges (legacy behaviour, pinned so any change is deliberate)', () => {
    it('returns 0 when the end year precedes the start year', () => {
      expect(inflation({ 2022: 5, 2023: 5 }, utc(2023, 6, 1), utc(2022, 6, 1))).toBe(0);
    });

    it('still applies the one-month minimum when the end precedes the start inside one year', () => {
      expect(inflation({ 2024: 12 }, utc(2024, 7, 1), utc(2024, 3, 1))).toBe(1);
    });
  });

  describe('determinism (pure core)', () => {
    const start = utc(2021, 1, 1); // midnight UTC on 1 January: west of UTC the local year would be 2020
    const end = utc(2024, 1, 1);

    it('reads only UTC calendar fields, so the host time zone cannot change the answer', () => {
      const expected = inflation(SPAIN, start, end);
      (['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours'] as const).forEach((method) => {
        jest.spyOn(Date.prototype, method).mockImplementation(() => {
          throw new Error(`${method} depends on the host time zone`);
        });
      });

      expect(inflation(SPAIN, start, end)).toBe(expected);
    });

    it('does not depend on the system clock', () => {
      jest.useFakeTimers();
      jest.setSystemTime(utc(1999, 1, 1));
      const whenEarly = inflation(SPAIN, start, end);
      jest.setSystemTime(utc(2031, 12, 31));

      expect(inflation(SPAIN, start, end)).toBe(whenEarly);
    });

    it('does not mutate its inputs', () => {
      const frozenRates = Object.freeze({ ...SPAIN });
      const from = utc(2021, 4, 15);
      const to = utc(2024, 6, 30);

      holdingPeriodInflationPercent({ annualRates: frozenRates, fallbackAnnualRate: 2.8, start: from, end: to });

      expect(from.getTime()).toBe(utc(2021, 4, 15).getTime());
      expect(to.getTime()).toBe(utc(2024, 6, 30).getTime());
    });
  });
});

describe('portfolio scenarios (offline replacements for the old live-network pnlEngine.test.ts)', () => {
  it('prorates a six-month same-year holding and stays within normal CPI bounds', () => {
    const result = inflation(SPAIN, utc(2024, 1, 1), utc(2024, 7, 1));

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it('compounds a three-year holding to more than a one-year holding', () => {
    const exit = utc(2024, 1, 1);

    expect(inflation(SPAIN, utc(2021, 1, 1), exit)).toBeGreaterThan(inflation(SPAIN, utc(2023, 1, 1), exit));
  });

  it('gives an earlier tranche more inflation, and a larger loss on the same amount', () => {
    const exit = utc(2024, 3, 15);
    const tranche2021 = inflation(SPAIN, utc(2021, 3, 15), exit);
    const tranche2023 = inflation(SPAIN, utc(2023, 3, 15), exit);

    expect(tranche2021).toBeGreaterThan(tranche2023);
    expect(inflationLossAmount(10_000, tranche2021)).toBeGreaterThan(inflationLossAmount(10_000, tranche2023));
  });

  it('orders mixed holding periods: 4-year stock > 1-year ETF > 6-month crypto', () => {
    const now = utc(2024, 7, 1);
    const stock = inflation(GERMANY, utc(2020, 1, 1), now);
    const etf = inflation(GERMANY, utc(2023, 1, 1), now);
    const crypto = inflation(GERMANY, utc(2024, 1, 1), now);

    expect(stock).toBeGreaterThan(etf);
    expect(etf).toBeGreaterThan(crypto);
  });
});

describe('inflationLossAmount', () => {
  it.each<[string, number, number, number]>([
    ['13.8% of 10,000', 10_000, 13.8, 1380],
    ['no inflation', 10_000, 0, 0],
    ['nothing invested', 0, 13.8, 0],
    ['deflation is a negative loss', 10_000, -1.2, -120],
  ])('%s', (_label, invested, percent, expected) => {
    expect(inflationLossAmount(invested, percent)).toBeCloseTo(expected, 8);
  });
});

describe('defaultAnnualInflationPercent', () => {
  it('returns the configured default for known countries', () => {
    expect(defaultAnnualInflationPercent('Spain')).toBe(2.8);
    expect(defaultAnnualInflationPercent('Argentina')).toBe(210);
  });

  it('falls back to the global default for unknown countries', () => {
    expect(defaultAnnualInflationPercent('Narnia')).toBe(FALLBACK_ANNUAL_INFLATION_PERCENT);
  });
});
