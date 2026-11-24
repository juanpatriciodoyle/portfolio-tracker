import { describe, expect, it } from 'vitest';
import type { BenchmarkPreviewResponse } from '../../../contracts';
import { translateEnglish as t, translatorFor } from '../../../i18n/translate';
import { knownAboutCountry, knownAboutIncome, knownAboutRent } from '../onboardingKnowledge';

const preview = (overrides: Partial<BenchmarkPreviewResponse> = {}): BenchmarkPreviewResponse => ({
  countryCode: 'ES',
  typicalMonthlyIncome: { amountMinor: 169725, currency: 'EUR', basis: 'EQUIVALISED', period: '2025', source: 'EUROSTAT' },
  incomePercentile: { percentile: 88.7, bound: 'EXACT', period: '2025', source: 'EUROSTAT', basis: 'EQUIVALISED' },
  rent: { housingMonthlyMinor: 120000, yourSharePercent: 37.5, typicalSharePercent: 26.7, differencePoints: 10.8, verdict: 'HIGHER', period: '2025', source: 'EUROSTAT' },
  gaps: [],
  ...overrides,
});

describe('what we already know about the country', () => {
  it('says what the typical person there has each month after tax, with where it comes from', () => {
    expect(knownAboutCountry(preview(), 'Spain', 'en-GB', t)).toEqual({
      text: 'In Spain, the typical person has about €1,697 a month after tax.',
      source: 'Eurostat · 2025',
    });
  });

  it('says nothing for a country that publishes no income figures', () => {
    expect(knownAboutCountry(preview({ typicalMonthlyIncome: null }), 'Spain', 'en-GB', t)).toBeNull();
    expect(knownAboutCountry(null, 'Spain', 'en-GB', t)).toBeNull();
  });
});

describe('where the income sits', () => {
  it('says how many people live on less, in plain words and neutrally', () => {
    expect(knownAboutIncome(preview(), 'Spain', 'en-GB', t)).toEqual({ text: 'About 89% of people in Spain live on less than that.', source: 'Eurostat · 2025' });
  });

  it('does not claim precision beyond the published range', () => {
    const base = { period: '2025', source: 'EUROSTAT' as const, basis: 'EQUIVALISED' as const };

    expect(knownAboutIncome(preview({ incomePercentile: { ...base, percentile: 90, bound: 'AT_LEAST' } }), 'Spain', 'en-GB', t)?.text).toBe('At least 90% of people in Spain live on less than that.');
    expect(knownAboutIncome(preview({ incomePercentile: { ...base, percentile: 10, bound: 'AT_MOST' } }), 'Spain', 'en-GB', t)?.text).toBe('At most 10% of people in Spain live on less than that.');
  });

  it('says nothing without a place to put the income', () => {
    expect(knownAboutIncome(preview({ incomePercentile: null }), 'Spain', 'en-GB', t)).toBeNull();
    expect(knownAboutIncome(null, 'Spain', 'en-GB', t)).toBeNull();
  });
});

describe('what the rent is', () => {
  it('gives the share of income, and what people who pay rent typically spend when that is published', () => {
    expect(knownAboutRent(preview(), 'Spain', 'en-GB', t)).toEqual({
      text: 'That is 37.5% of your income. People who pay rent in Spain typically spend 26.7%.',
      source: 'Eurostat · 2025',
    });
  });

  it('gives only the share of income when nothing is published to compare with', () => {
    expect(knownAboutRent(preview({ rent: null }), 'Spain', 'en-GB', t, 0.375)).toEqual({ text: 'That is 37.5% of your income.', source: null });
  });

  it('says nothing without a rent or an income', () => {
    expect(knownAboutRent(preview({ rent: null }), 'Spain', 'en-GB', t)).toBeNull();
    expect(knownAboutRent(null, 'Spain', 'en-GB', t)).toBeNull();
  });
});

describe('in Argentine Spanish', () => {
  it('reads like a person wrote it', () => {
    const es = translatorFor('es-AR');

    expect(knownAboutCountry(preview(), 'España', 'es-AR', es)?.text).toMatch(/^En España, una persona típica cuenta con unos .*1\.697.* por mes después de impuestos\.$/);
  });
});
