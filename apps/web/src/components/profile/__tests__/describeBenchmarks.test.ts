import { describe, expect, it } from 'vitest';
import { DEFAULT_STANDING, makePhaseBenchmark } from '../../../test/benchmarkFixtures';
import type { StandingDto } from '../../../contracts';
import { BENCHMARK_GAPS } from '../../../contracts';
import { translateEnglish as t, translatorFor } from '../../../i18n/translate';
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

    expect(housing?.label).toBe('Rent');
    expect(housing?.value).toBe('42.8% of your income');
    expect(housing?.sub).toBe('vs. 26.7% for people who rent');
    expect(housing?.note).toBe(
      'Your rent comes to €1,371 a month. Households that pay rent in Spain typically spend 26.7% of their income on it. 2025 · Eurostat'
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

  const rung = (overrides: Partial<StandingDto>): StandingDto => ({ ...DEFAULT_STANDING[0], ...overrides });

  it('has one badge each for the country, the continent and the world, in that order', () => {
    const { badges } = describeIt().positioning;

    expect(badges).toEqual([
      { scope: 'COUNTRY', text: 'Top 11% of people in Spain' },
      { scope: 'CONTINENT', text: 'Top 15% of people in the EU' },
      { scope: 'WORLD', text: 'Top 2% of people in the world' },
    ]);
  });

  it('names a World Bank region the way the data names it', () => {
    const lac = rung({ scope: 'CONTINENT', areaCode: 'LCN', areaName: 'Latin America & the Caribbean', percentile: 91.5 });

    expect(describeIt({ standing: [lac] }).positioning.badges[0].text).toBe('Top 8% of people in Latin America & the Caribbean');
  });

  it('does not claim more than the published range allows', () => {
    expect(describeIt({ standing: [rung({ percentile: 90, bound: 'AT_LEAST' })] }).positioning.badges[0].text).toBe('Top 10% (or better) of people in Spain');
    expect(describeIt({ standing: [rung({ percentile: 10, bound: 'AT_MOST' })] }).positioning.badges[0].text).toBe('Below the 10th percentile among people in Spain');
    expect(describeIt({ standing: [rung({ percentile: 99.8, bound: 'EXACT' })] }).positioning.badges[0].text).toBe('Top 1% of people in Spain');
  });

  it('shows only the rungs the data can place', () => {
    expect(describeIt({ standing: [] }).positioning.badges).toEqual([]);
    expect(describeIt({ standing: [DEFAULT_STANDING[0], DEFAULT_STANDING[2]] }).positioning.badges.map((badge) => badge.scope)).toEqual(['COUNTRY', 'WORLD']);
  });

  it('words the rent against what people who pay rent spend, neutrally: it describes, it does not judge', () => {
    const base = { housingMonthlyMinor: 30000, typicalSharePercent: 31, period: '2025', source: 'EUROSTAT' as const };

    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 24, differencePoints: -7, verdict: 'LOWER' }, continentHousing: null }).positioning.insights[0]).toBe(
      'Your rent is 24% of your income. People who pay rent in Spain typically spend 31%.'
    );
    expect(describeIt({ housingBurden: { ...base, yourSharePercent: 38, differencePoints: 7, verdict: 'HIGHER' }, continentHousing: null }).positioning.insights[0]).toBe(
      'Your rent is 38% of your income. People who pay rent in Spain typically spend 31%.'
    );
  });

  it('gives the EU its own line when it says something different from the country', () => {
    const insights = describeIt().positioning.insights;

    expect(insights[0]).toBe('Your rent is 42.8% of your income. People who pay rent in Spain typically spend 26.7%.');
    expect(insights[1]).toBe('Your rent is 42.8% of your income. People who pay rent in the EU typically spend 25%.');
  });

  it('merges the EU line into the country line when both typical shares read the same', () => {
    const same = { ...makePhaseBenchmark().continentHousing!, typicalSharePercent: 26.7 };

    const { insights } = describeIt({ continentHousing: same }).positioning;

    expect(insights[0]).toBe('Your rent is 42.8% of your income. People who pay rent in Spain and the EU typically spend 26.7%.');
    expect(insights.filter((line) => line.startsWith('Your rent'))).toHaveLength(1);
    expect(insights).toHaveLength(2);
  });

  it('keeps to three one-line insights and leaves out what is not known', () => {
    expect(describeIt().positioning.insights).toHaveLength(3);
    expect(describeIt().positioning.insights[2]).toBe('Your income buys 1.4x what the average person in Spain has');
    expect(describeIt({ housingBurden: null, continentHousing: null, purchasingPower: null }).positioning.insights).toEqual([]);
  });

  it('keeps what was compared, with the figure and its source, for the data sources', () => {
    const { areaFigures } = describeIt();

    expect(areaFigures.map((kpi) => kpi.label)).toEqual(['In the EU', 'In the world']);
    expect(areaFigures[0].note).toBe('Your income of about €38,400 a year per person (adjusted for household size, converted to euros) compared with people in the EU. 2025 · Eurostat');
    expect(areaFigures[1].value).toBe('98th percentile');
    expect(areaFigures[1].note).toBe('Your income of about $147 a day per person, in international dollars at 2021 prices, compared with people in the world. 2024 · World Bank');
  });

  it('lists each source once, with where to check it and when it was retrieved', () => {
    const { sources } = describeIt();

    expect(sources).toEqual([
      { name: 'Eurostat, EU-SILC', url: 'https://ec.europa.eu/eurostat', retrieved: '20 Oct 2026' },
      { name: 'World Bank, Poverty and Inequality Platform (2021 PPP round)', url: 'https://pip.worldbank.org', retrieved: '1 Jun 2026' },
    ]);
  });

  it('says what the income holds in each other nationality, with the tier when there is one', () => {
    const { equivalences } = describeIt({ nationalityEquivalences: [italy, argentina] }).positioning;

    expect(equivalences).toEqual([
      { countryCode: 'IT', text: 'Holds the purchasing power of €5,800 a month in Italy', tier: null },
      { countryCode: 'AR', text: expect.stringMatching(/^Holds the purchasing power of .* a month in Argentina$/), tier: 'Top 1% of people in Argentina' },
    ]);
  });

  it('still lists city rankings as not available, since no free source publishes them', () => {
    expect(describeIt().positioning.unavailable).toEqual(['City rankings need city-level income statistics, which are not connected yet.']);
  });
});

describe('gaps', () => {
  it('has a plain reason for every possible gap', () => {
    for (const gap of BENCHMARK_GAPS) expect(t(GAP_REASONS[gap]).length).toBeGreaterThan(10);
  });

  it('reports a phase with nothing to compare, and why', () => {
    const view = describeIt({ incomePercentile: null, standing: [], housingBurden: null, continentHousing: null, purchasingPower: null, gaps: ['NO_INCOME'] });

    expect(view.hasComparison).toBe(false);
    expect(view.income).toBeNull();
    expect(view.gaps).toEqual([t(GAP_REASONS.NO_INCOME)]);
  });

  it('keeps the comparisons it has next to the reasons for the ones it lacks', () => {
    const view = describeIt({ purchasingPower: null, gaps: ['NO_PURCHASING_POWER'] });

    expect(view.hasComparison).toBe(true);
    expect(view.gaps).toEqual([t(GAP_REASONS.NO_PURCHASING_POWER)]);
  });
});

describe('describeRefreshedAt', () => {
  it('formats the day, and says nothing when unknown or invalid', () => {
    expect(describeRefreshedAt('2026-10-20T08:00:00.000Z', 'en-GB')).toBe('20 Oct 2026');
    expect(describeRefreshedAt(null)).toBeNull();
    expect(describeRefreshedAt('garbage')).toBeNull();
  });

  it('names the countries in the language of the sentences around them', () => {
    const english = describePhaseBenchmark(makePhaseBenchmark({ countryCode: 'ES' }), nameOf, 'en-US', t);
    const englishText = [english.country, ...english.positioning.badges.map((b) => b.text), ...english.positioning.insights].join(' | ');
    expect(englishText).toContain('Spain');
    expect(englishText).not.toContain('España');

    const spanish = describePhaseBenchmark(makePhaseBenchmark({ countryCode: 'ES' }), nameOf, 'es-AR', translatorFor('es-AR'));
    const spanishText = [spanish.country, ...spanish.positioning.badges.map((b) => b.text), ...spanish.positioning.insights].join(' | ');
    expect(spanishText).toContain('España');
    expect(spanishText).toContain('Top 11% de las personas en España');
    expect(spanishText).not.toMatch(/\b(Housing|income)\b/);
  });
});
