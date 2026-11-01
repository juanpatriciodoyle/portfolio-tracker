import { describe, expect, it } from 'vitest';
import { makePhaseBenchmark } from '../../../test/benchmarkFixtures';
import { BENCHMARK_GAPS } from '../../../contracts';
import { describePhaseBenchmark, describeRefreshedAt, GAP_REASONS } from '../describeBenchmarks';

const nameOf = (id: string) => ({ p0: 'Buenos Aires' })[id];
const describeIt = (overrides = {}) => describePhaseBenchmark(makePhaseBenchmark(overrides), nameOf, 'en-GB');

describe('income percentile KPI', () => {
  it('shows the percentile and the top share, with the method in the note', () => {
    const { income } = describeIt();

    expect(income?.value).toBe('89th percentile');
    expect(income?.sub).toBe('Top 11%');
    expect(income?.note).toBe('Your household income compared with people in Spain, per person, adjusted for household size. 2025 · Eurostat');
  });

  it('flips to the bottom share below the middle', () => {
    const { income } = describeIt({ incomePercentile: { percentile: 30.4, bound: 'EXACT', period: '2026-Q1', source: 'INDEC', basis: 'PER_CAPITA' } });

    expect(income?.value).toBe('30th percentile');
    expect(income?.sub).toBe('Bottom 30%');
    expect(income?.note).toContain('per person. 2026-Q1 · INDEC');
  });

  it('does not claim precision beyond the published range', () => {
    const base = { period: '2025', source: 'EUROSTAT' as const, basis: 'EQUIVALISED' as const };

    expect(describeIt({ incomePercentile: { ...base, percentile: 90, bound: 'AT_LEAST' } }).income?.value).toBe('At least 90th percentile');
    expect(describeIt({ incomePercentile: { ...base, percentile: 10, bound: 'AT_MOST' } }).income?.value).toBe('At most 10th percentile');
  });

  it('rounds half up, uses the right ordinal and labels the World Bank', () => {
    const view = describeIt({ incomePercentile: { percentile: 50.5, bound: 'EXACT', period: '2024', source: 'WORLD_BANK', basis: 'PER_CAPITA' } });

    expect(view.income?.value).toBe('51st percentile');
    expect(view.income?.note).toContain('World Bank');
    const ordinals = [2, 3, 11, 12, 13, 22].map((n) => describeIt({ incomePercentile: { percentile: n, bound: 'EXACT', period: '2024', source: 'WORLD_BANK', basis: 'PER_CAPITA' } }).income?.value);
    expect(ordinals).toEqual(['2nd percentile', '3rd percentile', '11th percentile', '12th percentile', '13th percentile', '22nd percentile']);
  });

  it('never says "Top 0%" and leaves the ordinal off outside English', () => {
    const top = { percentile: 99.8, bound: 'EXACT' as const, period: '2024', source: 'WORLD_BANK' as const, basis: 'PER_CAPITA' as const };

    expect(describeIt({ incomePercentile: top }).income?.sub).toBe('Top 1%');
    expect(describePhaseBenchmark(makePhaseBenchmark({ incomePercentile: top }), nameOf, 'es-ES').income?.value).toBe('100 percentile');
  });
});

describe('housing burden KPI', () => {
  it('shows the share against the typical one, and keeps the amount and sources in the note', () => {
    const { housing } = describeIt();

    expect(housing?.value).toBe('42.8% housing burden');
    expect(housing?.sub).toBe('vs. 16% typical');
    expect(housing?.note).toBe(
      'Rent, utilities and property taxes come to €1,371 a month. A typical household in Spain spends 16%. 2025 · Eurostat'
    );
    expect(housing?.verdict).toBe('HIGHER');
  });

  it('keeps the verdict for LOWER and SIMILAR', () => {
    const base = { housingMonthlyMinor: 30000, typicalSharePercent: 16, period: '2025', source: 'EUROSTAT' as const };

    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 10.2, differencePoints: -5.8, verdict: 'LOWER' } }).housing?.verdict).toBe('LOWER');
    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 17, differencePoints: 1, verdict: 'SIMILAR' } }).housing?.verdict).toBe('SIMILAR');
  });
});

describe('purchasing power KPI', () => {
  it('leads with the ratio to the national average and explains the unit in the note', () => {
    const { purchasingPower } = describeIt();

    expect(purchasingPower?.value).toBe('1.4x purchasing power');
    expect(purchasingPower?.sub).toBe('vs. the average person in Spain');
    expect(purchasingPower?.note).toContain('about $5,604 a month at world-average prices');
    expect(purchasingPower?.note).toMatch(/not real money/);
    expect(purchasingPower?.note).toContain('That is 1.59x what you had in Buenos Aires.');
    expect(purchasingPower?.note).toContain('2025 · World Bank');
  });

  it('falls back to the dollar figure without a national average, and skips a previous phase it cannot name', () => {
    const power = { internationalDollarsPerMonth: 100, period: '2025', source: 'WORLD_BANK' as const, versusNationalAverage: null };

    const named = describeIt({ purchasingPower: { ...power, versusPreviousPhase: { phaseId: 'p0', ratio: 0.63 } } }).purchasingPower;
    expect(named?.value).toBe('$100 a month');
    expect(named?.sub).toBe('at world-average prices');
    expect(named?.note).toContain('That is 0.63x what you had in Buenos Aires.');
    expect(describeIt({ purchasingPower: { ...power, versusPreviousPhase: { phaseId: 'unknown', ratio: 2 } } }).purchasingPower?.note).not.toContain('what you had in');
  });
});

describe('positioning', () => {
  const argentina = {
    countryCode: 'AR',
    currency: 'ARS',
    equivalentMonthlyIncomeMinor: 317_929_927,
    incomePercentile: { percentile: 99.8, bound: 'EXACT' as const, period: '2026-Q1', source: 'INDEC' as const, basis: 'PER_CAPITA' as const },
  };
  const italy = { countryCode: 'IT', currency: 'EUR', equivalentMonthlyIncomeMinor: 580_000, incomePercentile: null };

  it('has a badge for where the income sits in the country of the phase', () => {
    expect(describeIt().positioning.badge).toBe('Top 11% in Spain');
  });

  it('does not claim more than the published range allows', () => {
    const base = { period: '2025', source: 'EUROSTAT' as const, basis: 'EQUIVALISED' as const };

    expect(describeIt({ incomePercentile: { ...base, percentile: 90, bound: 'AT_LEAST' } }).positioning.badge).toBe('Top 10% or better in Spain');
    expect(describeIt({ incomePercentile: { ...base, percentile: 10, bound: 'AT_MOST' } }).positioning.badge).toBe('Below the 10th percentile in Spain');
    expect(describeIt({ incomePercentile: { ...base, percentile: 99.8, bound: 'EXACT' } }).positioning.badge).toBe('Top 1% in Spain');
  });

  it('has no badge without a percentile', () => {
    expect(describeIt({ incomePercentile: null }).positioning.badge).toBeNull();
  });

  it('says what the income holds in each other nationality, with the tier when there is one', () => {
    const { equivalences } = describeIt({ nationalityEquivalences: [italy, argentina] }).positioning;

    expect(equivalences).toEqual([
      { countryCode: 'IT', text: 'Holds the purchasing power of €5,800 a month in Italy', tier: null },
      { countryCode: 'AR', text: expect.stringMatching(/^Holds the purchasing power of .* a month in Argentina$/), tier: 'Top 1% in Argentina' },
    ]);
  });

  it('lists the global and city rankings as not available, since no source publishes them here', () => {
    expect(describeIt().positioning.unavailable).toEqual([
      'A global ranking needs a worldwide income distribution, which is not connected yet.',
      'City rankings need city-level income statistics, which are not connected yet.',
    ]);
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
