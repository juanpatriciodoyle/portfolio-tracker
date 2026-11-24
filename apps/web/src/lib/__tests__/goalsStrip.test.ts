import { describe, it, expect } from 'vitest';
import type { MilestoneDto, SecondSalaryResponse, TimelineEntryDto } from '../../contracts';
import { translatorFor } from '../../i18n/translate';
import { goalsStrip, MIN_PORTFOLIO_FOR_PAYOUT_MINOR } from '../goalsStrip';

const t = translatorFor('en');

const phase = (overrides: Partial<TimelineEntryDto> = {}): TimelineEntryDto =>
  ({
    phaseId: 'p1',
    currency: 'EUR',
    monthlyIncomeMinor: 320000,
    savingsCapacityMinor: 221500,
    status: 'current',
    ...overrides,
  }) as TimelineEntryDto;

const livingCost = (overrides: Partial<MilestoneDto> = {}): MilestoneDto => ({
  id: 3,
  kind: 'LIVING_COST',
  monthlyCostMinor: 230000,
  capitalNeededMinor: 46000000,
  reached: true,
  progress: 1,
  ...overrides,
});

const secondSalary = (overrides: Partial<SecondSalaryResponse> = {}): SecondSalaryResponse => ({
  asOf: '2026-11-24',
  currency: 'EUR',
  capitalMinor: 46000000,
  annualYield: 0.06,
  secondSalaryMinor: 249500,
  milestones: [livingCost()],
  reachedMilestone: 3,
  gap: null,
  target: null,
  ...overrides,
});

const strip = (input: Partial<Parameters<typeof goalsStrip>[0]> = {}) => goalsStrip({ phase: phase(), secondSalary: secondSalary(), ...input }, t, 'en-US');

const lines = (view: ReturnType<typeof strip>) => (view.kind === 'goals' ? view.lines : []);

describe('goalsStrip: a prompt when there is nothing to say yet', () => {
  it('asks for the profile when no home is being lived in', () => {
    expect(strip({ phase: null })).toEqual({ kind: 'prompt' });
  });

  it('asks for the profile when the home has no income, never showing a zero', () => {
    expect(strip({ phase: phase({ monthlyIncomeMinor: 0 }) })).toEqual({ kind: 'prompt' });
  });
});

describe('goalsStrip: what you keep and what the portfolio could pay', () => {
  it('says the two things, in order, each with its label, and no goal', () => {
    const view = strip();
    expect(view.kind).toBe('goals');
    expect(lines(view).map((line) => line.key)).toEqual(['keep', 'pays']);
    expect(lines(view).map((line) => line.label)).toEqual(['What you keep', 'What your portfolio could pay']);
  });

  it('says what is kept after fixed costs, in the currency of the home', () => {
    const view = strip({ phase: phase({ currency: 'USD', savingsCapacityMinor: 221500 }) });
    expect(lines(view)[0].text).toBe('You keep about $2,215 a month after fixed costs.');
  });

  it('says plainly when fixed costs are above the income', () => {
    const view = strip({ phase: phase({ savingsCapacityMinor: -40000 }) });
    expect(lines(view)[0].text).toBe('Your fixed costs are about €400 a month more than you earn.');
  });

  it('says what the portfolio could pay with the 6% in the sentence, and that it covers all the living costs', () => {
    expect(lines(strip())[1].text).toBe("At 6% a year, your portfolio could pay about €2,495 a month. That's 100% of your monthly living costs.");
  });

  it('says how much of the living costs it covers when it is only part of them (rounded down)', () => {
    const view = strip({ secondSalary: secondSalary({ secondSalaryMinor: 150000, milestones: [livingCost({ progress: 0.6249, reached: false })], reachedMilestone: 2 }) });
    expect(lines(view)[1].text).toBe("At 6% a year, your portfolio could pay about €1,500 a month. That's 62% of your monthly living costs.");
  });

  it('writes no sentence about the coverage when it is under 1%', () => {
    const view = strip({ secondSalary: secondSalary({ milestones: [livingCost({ progress: 0.004, reached: false })], reachedMilestone: null }) });
    expect(lines(view)[1].text).toBe('At 6% a year, your portfolio could pay about €2,495 a month.');
  });

  it('writes no sentence about the coverage when the living costs are not known', () => {
    const view = strip({ secondSalary: secondSalary({ milestones: [livingCost({ id: 2, kind: 'RENT' })], reachedMilestone: 2 }) });
    expect(lines(view)[1].text).toBe('At 6% a year, your portfolio could pay about €2,495 a month.');
  });

  it('never says the old long wording', () => {
    const text = lines(strip()).map((line) => line.text).join(' ');
    expect(text).not.toMatch(/Autonomy|cautious/i);
  });

  it('puts the reason in words when costs cannot be compared with the portfolio', () => {
    const view = strip({ secondSalary: secondSalary({ gap: 'CURRENCY_MISMATCH', reachedMilestone: null, milestones: [] }) });
    expect(lines(view)[1].text).toContain('Your costs are in another currency than your portfolio');
  });

  it('leaves the line out instead of saying zero when the portfolio pays nothing', () => {
    const view = strip({ secondSalary: secondSalary({ secondSalaryMinor: 0 }) });
    expect(lines(view).map((line) => line.key)).toEqual(['keep']);
  });

  it('does not say what a tiny portfolio could pay: a few euros a month is true but only noise', () => {
    const view = strip({ secondSalary: secondSalary({ capitalMinor: MIN_PORTFOLIO_FOR_PAYOUT_MINOR - 1, secondSalaryMinor: 151 }) });
    expect(lines(view).map((line) => line.key)).toEqual(['keep']);
  });

  it('says it from a portfolio of 1,000 up', () => {
    expect(MIN_PORTFOLIO_FOR_PAYOUT_MINOR).toBe(100000);
    const view = strip({ secondSalary: secondSalary({ capitalMinor: MIN_PORTFOLIO_FOR_PAYOUT_MINOR, secondSalaryMinor: 500 }) });
    expect(lines(view).map((line) => line.key)).toEqual(['keep', 'pays']);
  });

  it('does not wait for a missing answer: the other line still shows', () => {
    expect(strip({ secondSalary: null })).toMatchObject({ kind: 'goals', lines: [{ key: 'keep' }] });
  });
});

describe('goalsStrip in Argentine Spanish', () => {
  it('speaks in voseo, with amounts written the Argentine way', () => {
    const es = translatorFor('es-AR');
    const view = goalsStrip({ phase: phase(), secondSalary: secondSalary() }, es, 'es-AR');
    expect(lines(view)[0].text).toBe('Te quedan unos € 2.215 por mes después de los costos fijos.');
    expect(lines(view)[1].text).toBe('Con un 6% anual, tu portfolio podría pagar unos € 2.495 por mes. Eso es el 100% de tus costos de vida mensuales.');
  });
});
