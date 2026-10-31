import { describe, expect, it } from 'vitest';
import { makePhaseBenchmark } from '../../../test/benchmarkFixtures';
import { BENCHMARK_GAPS } from '../../../contracts';
import { describePhaseBenchmark, describeRefreshedAt, GAP_REASONS } from '../describeBenchmarks';

const nameOf = (id: string) => ({ p0: 'Buenos Aires' })[id];
const describeIt = (overrides = {}) => describePhaseBenchmark(makePhaseBenchmark(overrides), nameOf, 'en-GB');

describe('income percentile wording', () => {
  it('says "higher than about N of every 100" from the middle upwards, with basis, period and source', () => {
    const { income } = describeIt();

    expect(income?.headline).toBe('Your household income is higher than about 89 of every 100 people in Spain.');
    expect(income?.caption).toBe('per person, adjusted for household size · 2025 · Eurostat');
  });

  it('flips to "earn less than you" below the middle', () => {
    const { income } = describeIt({ incomePercentile: { percentile: 30.4, bound: 'EXACT', period: '2026-Q1', source: 'INDEC', basis: 'PER_CAPITA' } });

    expect(income?.headline).toBe('In Spain, about 30 of every 100 people earn less than you.');
    expect(income?.caption).toBe('per person · 2026-Q1 · INDEC');
  });

  it('does not claim precision beyond the published range', () => {
    const base = { period: '2025', source: 'EUROSTAT' as const, basis: 'EQUIVALISED' as const };

    expect(describeIt({ incomePercentile: { ...base, percentile: 90, bound: 'AT_LEAST' } }).income?.headline).toContain('higher than at least 90 of every 100');
    expect(describeIt({ incomePercentile: { ...base, percentile: 10, bound: 'AT_MOST' } }).income?.headline).toContain('higher than at most 10 of every 100');
  });

  it('rounds half up and labels the World Bank', () => {
    const view = describeIt({ incomePercentile: { percentile: 50.5, bound: 'EXACT', period: '2024', source: 'WORLD_BANK', basis: 'PER_CAPITA' } });

    expect(view.income?.headline).toContain('about 51 of every 100');
    expect(view.income?.caption).toContain('World Bank');
  });
});

describe('housing burden wording', () => {
  it('shows both shares, the gap and the amount, with bars scaled to the larger share', () => {
    const { housing } = describeIt();

    expect(housing?.headline).toBe('Housing takes 42.8% of your income. A typical household in Spain spends 16%.');
    expect(housing?.detail).toBe('That is 26.8 points more than typical. Your housing costs come to €1,371 a month.');
    expect(housing?.you).toEqual({ label: '42.8%', widthPercent: 100 });
    expect(housing?.typical).toEqual({ label: '16%', widthPercent: 37 });
    expect(housing?.verdict).toBe('HIGHER');
    expect(housing?.caption).toBe('Rent, utilities and property taxes · 2025 · Eurostat');
  });

  it('words LOWER and SIMILAR', () => {
    const base = { housingMonthlyMinor: 30000, typicalSharePercent: 16, period: '2025', source: 'EUROSTAT' as const };

    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 10.2, differencePoints: -5.8, verdict: 'LOWER' } }).housing?.detail).toContain('5.8 points less than typical');
    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 17, differencePoints: 1, verdict: 'SIMILAR' } }).housing?.detail).toContain('About the same as a typical household.');
  });

  it('keeps bar widths sane for tiny shares', () => {
    const { housing } = describeIt({
      housingBurden: { housingMonthlyMinor: 0, yourSharePercent: 0, typicalSharePercent: 0, differencePoints: 0, verdict: 'SIMILAR', period: '2025', source: 'EUROSTAT' },
    });

    expect(housing?.you.widthPercent).toBe(0);
    expect(housing?.typical.widthPercent).toBe(0);
  });
});

describe('purchasing power wording', () => {
  it('names the unit, the previous phase and the national average', () => {
    const { purchasingPower } = describeIt();

    expect(purchasingPower?.headline).toBe('Your income buys about $5,604 a month at world-average prices.');
    expect(purchasingPower?.comparisons).toEqual(['That is 1.59x what you had in Buenos Aires.', 'About 1.4x the average person in Spain.']);
    expect(purchasingPower?.unitNote).toMatch(/not real money/);
    expect(purchasingPower?.caption).toBe('2025 · World Bank');
  });

  it('shows ratios below one and skips comparisons it cannot name or does not have', () => {
    const power = { internationalDollarsPerMonth: 100, period: '2025', source: 'WORLD_BANK' as const };

    expect(describeIt({ purchasingPower: { ...power, versusPreviousPhase: { phaseId: 'p0', ratio: 0.63 }, versusNationalAverage: null } }).purchasingPower?.comparisons).toEqual([
      'That is 0.63x what you had in Buenos Aires.',
    ]);
    expect(describeIt({ purchasingPower: { ...power, versusPreviousPhase: { phaseId: 'unknown', ratio: 2 }, versusNationalAverage: null } }).purchasingPower?.comparisons).toEqual([]);
  });
});

describe('gaps', () => {
  it('has a plain reason for every possible gap', () => {
    for (const gap of BENCHMARK_GAPS) expect(GAP_REASONS[gap].length).toBeGreaterThan(10);
  });

  it('reports a phase with nothing to compare, and why', () => {
    const view = describeIt({ incomePercentile: null, housingBurden: null, purchasingPower: null, gaps: ['NO_INCOME'] });

    expect(view.hasComparison).toBe(false);
    expect(view.income).toBeNull();
    expect(view.gaps).toEqual([GAP_REASONS.NO_INCOME]);
  });

  it('keeps the comparisons it has next to the reasons for the ones it lacks', () => {
    const view = describeIt({ purchasingPower: null, gaps: ['NO_PURCHASING_POWER'] });

    expect(view.hasComparison).toBe(true);
    expect(view.gaps).toEqual([GAP_REASONS.NO_PURCHASING_POWER]);
  });
});

describe('describeRefreshedAt', () => {
  it('formats the day, and says nothing when unknown or invalid', () => {
    expect(describeRefreshedAt('2026-10-20T08:00:00.000Z', 'en-GB')).toBe('20 Oct 2026');
    expect(describeRefreshedAt(null)).toBeNull();
    expect(describeRefreshedAt('garbage')).toBeNull();
  });
});
