import { AVERAGE_DAYS_PER_MONTH } from '../contracts/calendarDate';
import { percentileAmong, referenceDollarsPerDay, convertAmountMinor, continentAreaOf } from '../domain/standing';

const points = [
  { percentile: 10, value: 100 },
  { percentile: 50, value: 500 },
  { percentile: 90, value: 900 },
];

describe('percentileAmong', () => {
  it('interpolates between published points', () => {
    expect(percentileAmong(points, 300)).toEqual({ percentile: 30, bound: 'EXACT' });
  });
  it('does not extrapolate beyond the published range', () => {
    expect(percentileAmong(points, 50)).toEqual({ percentile: 10, bound: 'AT_MOST' });
    expect(percentileAmong(points, 5000)).toEqual({ percentile: 90, bound: 'AT_LEAST' });
  });
  it('has no answer without points', () => {
    expect(percentileAmong([], 1)).toBeNull();
  });
  it('is exact on a published point', () => {
    expect(percentileAmong(points, 500)).toEqual({ percentile: 50, bound: 'EXACT' });
  });
});

describe('referenceDollarsPerDay', () => {
  const base = { monthlyIncomeMinor: 300_000, currency: 'EUR', household: { adults: 1, children: 0 }, lcuPerInternationalDollar: 0.6, priceIndexSince2021: 1 };

  it('shares the household income among everybody, then converts a day of it at the purchasing power factor', () => {
    // 3000 EUR a month, one person, the average days a month, 0.6 EUR per international dollar.
    expect(referenceDollarsPerDay(base)).toBeCloseTo(3000 / AVERAGE_DAYS_PER_MONTH / 0.6, 6);
  });
  it('counts adults and children alike (per person)', () => {
    expect(referenceDollarsPerDay({ ...base, household: { adults: 2, children: 2 } })).toBeCloseTo(referenceDollarsPerDay(base)! / 4, 6);
  });
  it('takes out the price rise of the dollar since the distribution was measured (2021 prices)', () => {
    expect(referenceDollarsPerDay({ ...base, priceIndexSince2021: 1.25 })).toBeCloseTo(referenceDollarsPerDay(base)! / 1.25, 6);
  });
  it('respects currencies without decimals', () => {
    expect(referenceDollarsPerDay({ ...base, monthlyIncomeMinor: 300_000, currency: 'JPY', lcuPerInternationalDollar: 100 })).toBeCloseTo(300_000 / AVERAGE_DAYS_PER_MONTH / 100, 6);
  });
  it('is null for a factor that is not a positive number', () => {
    expect(referenceDollarsPerDay({ ...base, lcuPerInternationalDollar: 0 })).toBeNull();
    expect(referenceDollarsPerDay({ ...base, priceIndexSince2021: Number.NaN })).toBeNull();
  });
});

describe('convertAmountMinor', () => {
  const rates = { EUR: 1, USD: 0.8, JPY: 0.006 };
  it('is the same amount in the same currency', () => {
    expect(convertAmountMinor(12345, 'EUR', 'EUR', rates)).toBe(12345);
  });
  it('converts through the euro value of each currency', () => {
    expect(convertAmountMinor(10_000, 'USD', 'EUR', rates)).toBe(8000);
  });
  it('accounts for different minor-unit sizes', () => {
    // 1000 yen (no decimals) = 6 euros = 600 cents.
    expect(convertAmountMinor(1000, 'JPY', 'EUR', rates)).toBe(600);
  });
  it('is null when a rate is missing', () => {
    expect(convertAmountMinor(100, 'ARS', 'EUR', rates)).toBeNull();
  });
});

describe('continentAreaOf', () => {
  it('puts European countries, in or out of the EU, against the EU aggregate', () => {
    expect(continentAreaOf('ES', 'ECS')).toEqual({ code: 'EU', name: 'the EU' });
    expect(continentAreaOf('GB', 'ECS')).toEqual({ code: 'EU', name: 'the EU' });
    expect(continentAreaOf('CH', null)).toEqual({ code: 'EU', name: 'the EU' });
  });
  it('uses the World Bank region for everyone else, named honestly', () => {
    expect(continentAreaOf('AR', 'LCN')).toEqual({ code: 'LCN', name: 'Latin America & the Caribbean' });
    expect(continentAreaOf('US', 'NAC')).toEqual({ code: 'NAC', name: 'North America' });
    expect(continentAreaOf('KZ', 'ECS')).toEqual({ code: 'ECS', name: 'Europe & Central Asia' });
  });
  it('has none when the region is unknown', () => {
    expect(continentAreaOf('XX', null)).toBeNull();
    expect(continentAreaOf('XX', 'NA')).toBeNull();
  });
});
