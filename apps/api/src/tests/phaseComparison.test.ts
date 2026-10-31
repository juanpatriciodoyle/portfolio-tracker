import { InvalidFxRateError, MissingFxRateError } from '../domain/errors';
import { comparePhases, type PhaseSnapshot } from '../domain/phaseComparison';

const zeroes = {
  RENT: 0,
  ELECTRICITY: 0,
  GAS: 0,
  WATER: 0,
  INTERNET: 0,
  PHONE: 0,
  SUBSCRIPTIONS: 0,
  TAXES: 0,
  OTHER: 0,
};

const snapshot = (overrides: Partial<PhaseSnapshot> = {}): PhaseSnapshot => ({
  currency: 'EUR',
  monthlyIncomeMinor: 300000,
  monthlyFixedCostsMinor: 150000,
  savingsCapacityMinor: 150000,
  fixedCostsByCategoryMinor: { ...zeroes, RENT: 120000, ELECTRICITY: 30000 },
  ...overrides,
});

describe('comparePhases in one currency', () => {
  it('reports no change between identical phases', () => {
    const result = comparePhases(snapshot(), snapshot());

    expect(result).toMatchObject({
      currency: 'EUR',
      monthlyIncomeDeltaMinor: 0,
      monthlyFixedCostsDeltaMinor: 0,
      savingsCapacityDeltaMinor: 0,
      fixedCostsDeltaFraction: 0,
    });
    expect(result.categories.every((category) => category.deltaMinor === 0)).toBe(true);
  });

  it('measures change as later minus earlier, so cheaper is negative', () => {
    const cheaper = snapshot({
      monthlyIncomeMinor: 350000,
      monthlyFixedCostsMinor: 100000,
      savingsCapacityMinor: 250000,
      fixedCostsByCategoryMinor: { ...zeroes, RENT: 90000, INTERNET: 10000 },
    });

    const result = comparePhases(snapshot(), cheaper);

    expect(result.monthlyIncomeDeltaMinor).toBe(50000);
    expect(result.monthlyFixedCostsDeltaMinor).toBe(-50000);
    expect(result.savingsCapacityDeltaMinor).toBe(100000);
    expect(result.fixedCostsDeltaFraction).toBeCloseTo(-1 / 3, 10);
  });

  it('lists only the categories used by either phase, treating a missing one as zero', () => {
    const other = snapshot({ fixedCostsByCategoryMinor: { ...zeroes, RENT: 90000, INTERNET: 10000 } });

    expect(comparePhases(snapshot(), other).categories).toEqual([
      { category: 'RENT', fromMinor: 120000, toMinor: 90000, deltaMinor: -30000 },
      { category: 'ELECTRICITY', fromMinor: 30000, toMinor: 0, deltaMinor: -30000 },
      { category: 'INTERNET', fromMinor: 0, toMinor: 10000, deltaMinor: 10000 },
    ]);
  });

  it('has no percentage when the earlier phase had no fixed costs', () => {
    const free = snapshot({ monthlyFixedCostsMinor: 0, fixedCostsByCategoryMinor: { ...zeroes } });

    expect(comparePhases(free, snapshot()).fixedCostsDeltaFraction).toBeNull();
  });

  it('ignores exchange rates entirely when the currencies match, even broken ones', () => {
    expect(() => comparePhases(snapshot(), snapshot(), { fx: { EUR: Number.NaN } })).not.toThrow();
  });

  it('does not mutate its inputs', () => {
    const from = Object.freeze(snapshot());
    const to = Object.freeze(snapshot());

    expect(() => comparePhases(from, to)).not.toThrow();
  });
});

describe('comparePhases across currencies', () => {
  const euro = snapshot();
  const dollar = snapshot({
    currency: 'USD',
    monthlyIncomeMinor: 360000,
    monthlyFixedCostsMinor: 180000,
    savingsCapacityMinor: 180000,
    fixedCostsByCategoryMinor: { ...zeroes, RENT: 150000, ELECTRICITY: 30000 },
  });
  // One unit of each currency, valued in a common reference currency.
  const fx = { EUR: 1, USD: 0.9 };

  it('cannot compare without an exchange rate, and names the missing currency', () => {
    expect(() => comparePhases(euro, dollar)).toThrow(MissingFxRateError);
    expect(() => comparePhases(euro, dollar, { fx: { EUR: 1 } })).toThrow(/USD/);
  });

  it('converts the earlier phase into the later phase currency by default', () => {
    const result = comparePhases(euro, dollar, { fx });

    expect(result.currency).toBe('USD');
    // 150,000 EUR x 1 / 0.9 = 166,666.67 -> 166,667 USD; 180,000 - 166,667 = 13,333
    expect(result.monthlyFixedCostsDeltaMinor).toBe(13333);
    expect(result.monthlyIncomeDeltaMinor).toBe(360000 - 333333);
  });

  it('reports in another currency when asked, converting the later phase instead', () => {
    const result = comparePhases(euro, dollar, { fx, reportingCurrency: 'EUR' });

    expect(result.currency).toBe('EUR');
    // 180,000 USD x 0.9 / 1 = 162,000 EUR; 162,000 - 150,000 = 12,000
    expect(result.monthlyFixedCostsDeltaMinor).toBe(12000);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects the exchange rate %p', (rate) => {
    expect(() => comparePhases(euro, dollar, { fx: { EUR: 1, USD: rate } })).toThrow(InvalidFxRateError);
  });

  it('only checks the rates it actually uses', () => {
    expect(() => comparePhases(euro, dollar, { fx: { EUR: 1, USD: 0.9, XXX: -5 } })).not.toThrow();
  });

  it('returns whole minor units', () => {
    const result = comparePhases(euro, dollar, { fx });

    expect(Number.isInteger(result.monthlyFixedCostsDeltaMinor)).toBe(true);
    expect(result.categories.every((category) => Number.isInteger(category.deltaMinor))).toBe(true);
  });
});
