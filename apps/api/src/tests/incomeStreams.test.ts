import { AVERAGE_DAYS_PER_MONTH } from '../domain/calendarDate';
import { InvalidLivingPhaseError } from '../domain/errors';
import {
  averageMonthlyIncomeMinor,
  earnedIncomeMinor,
  monthlyIncomeOn,
  streamsFromLegacyIncome,
  type IncomeStream,
} from '../domain/income';
import { buildTimeline, createLivingPhase, phaseSnapshot, type LivingPhase } from '../domain/livingPhase';

const stream = (label: string, amountMinor: number, startDate: string, endDate: string | null = null): IncomeStream => ({
  label,
  amountMinor,
  startDate,
  endDate,
});

const phase = (overrides: Partial<LivingPhase> = {}): LivingPhase => ({
  id: 'p1',
  startDate: '2026-01-01',
  endDate: null,
  currency: 'EUR',
  incomeStreams: [],
  fixedCosts: [],
  ...overrides,
});

const rent = [{ id: 'c', category: 'RENT' as const, cadence: 'MONTHLY' as const, amountMinor: 100000 }];

describe('monthlyIncomeOn', () => {
  it('is nothing without streams', () => {
    expect(monthlyIncomeOn([], '2026-04-15')).toBe(0);
  });

  it('sums every stream active on the day, including overlapping jobs', () => {
    const streams = [stream('Job', 300000, '2026-01-01'), stream('Freelance', 50000, '2026-03-01', '2026-05-31')];
    expect(monthlyIncomeOn(streams, '2026-02-28')).toBe(300000);
    expect(monthlyIncomeOn(streams, '2026-03-01')).toBe(350000);
    expect(monthlyIncomeOn(streams, '2026-05-31')).toBe(350000);
    expect(monthlyIncomeOn(streams, '2026-06-01')).toBe(300000);
  });

  it('is zero in a gap between streams, with no placeholder stream', () => {
    const streams = [stream('Old job', 300000, '2026-01-01', '2026-02-28'), stream('New job', 320000, '2026-05-01')];
    expect(monthlyIncomeOn(streams, '2026-03-15')).toBe(0);
    expect(monthlyIncomeOn(streams, '2026-05-01')).toBe(320000);
  });

  it('counts a stream on its first and last day, and not before it starts', () => {
    const streams = [stream('Gig', 100, '2026-02-01', '2026-02-01')];
    expect(monthlyIncomeOn(streams, '2026-01-31')).toBe(0);
    expect(monthlyIncomeOn(streams, '2026-02-01')).toBe(100);
    expect(monthlyIncomeOn(streams, '2026-02-02')).toBe(0);
  });
});

describe('earnedIncomeMinor', () => {
  const span = { startDate: '2026-01-01', endDate: null };

  it('is zero without streams and before the phase started', () => {
    expect(earnedIncomeMinor({ ...span, streams: [] }, '2026-06-30')).toBe(0);
    expect(earnedIncomeMinor({ ...span, streams: [stream('Job', 300000, '2026-01-01')] }, '2025-12-31')).toBe(0);
  });

  it('counts one stream for the days it lasted', () => {
    const earned = earnedIncomeMinor({ ...span, streams: [stream('Job', 300000, '2026-01-01')] }, '2026-04-10');
    expect(earned).toBe(Math.round((300000 * 100) / AVERAGE_DAYS_PER_MONTH));
  });

  it('adds concurrent streams, each for its own days', () => {
    // Job all of Jan-Mar (90 days); freelance only in March (31 days).
    const streams = [stream('Job', 300000, '2026-01-01'), stream('Freelance', 60000, '2026-03-01')];
    expect(earnedIncomeMinor({ ...span, streams }, '2026-03-31')).toBe(Math.round((300000 * 90 + 60000 * 31) / AVERAGE_DAYS_PER_MONTH));
  });

  it('counts a gap as nothing', () => {
    const streams = [stream('Job', 300000, '2026-01-01', '2026-01-31'), stream('Next job', 300000, '2026-03-01')];
    expect(earnedIncomeMinor({ ...span, streams }, '2026-03-31')).toBe(Math.round((300000 * (31 + 31)) / AVERAGE_DAYS_PER_MONTH));
  });

  it('ignores the days of a stream outside the phase', () => {
    const streams = [stream('Before', 999999, '2025-01-01', '2025-12-31'), stream('Job', 300000, '2025-06-01')];
    const earned = earnedIncomeMinor({ startDate: '2026-01-01', endDate: '2026-01-31', streams }, '2026-12-31');
    expect(earned).toBe(Math.round((300000 * 31) / AVERAGE_DAYS_PER_MONTH));
  });

  it('stops at the as-of day', () => {
    const streams = [stream('Job', 300000, '2026-01-01')];
    expect(earnedIncomeMinor({ ...span, streams }, '2026-01-31')).toBe(Math.round((300000 * 31) / AVERAGE_DAYS_PER_MONTH));
  });

  it('does not depend on the order of the streams', () => {
    const streams = [stream('A', 100000, '2026-02-01', '2026-02-28'), stream('B', 350000, '2026-04-01')];
    expect(earnedIncomeMinor({ ...span, streams }, '2026-05-31')).toBe(earnedIncomeMinor({ ...span, streams: [...streams].reverse() }, '2026-05-31'));
  });
});

describe('averageMonthlyIncomeMinor', () => {
  it('divides what was earned by the months lived', () => {
    const streams = [stream('Job', 300000, '2026-01-01', '2026-01-31'), stream('Job', 300000, '2026-03-01', '2026-03-31')];
    // 62 days earned over 90 days lived.
    const earned = earnedIncomeMinor({ startDate: '2026-01-01', endDate: null, streams }, '2026-03-31');
    const months = 90 / AVERAGE_DAYS_PER_MONTH;
    expect(averageMonthlyIncomeMinor({ startDate: '2026-01-01', endDate: null, streams }, '2026-03-31')).toBe(Math.round(earned / months));
  });

  it('equals the monthly amount for a stream that covers the whole stay', () => {
    const streams = [stream('Job', 300000, '2025-01-01')];
    expect(averageMonthlyIncomeMinor({ startDate: '2026-01-01', endDate: null, streams }, '2026-06-30')).toBe(300000);
  });

  it('is zero for a phase that has not started or has no income', () => {
    expect(averageMonthlyIncomeMinor({ startDate: '2026-01-01', endDate: null, streams: [stream('Job', 1, '2025-01-01')] }, '2025-12-31')).toBe(0);
    expect(averageMonthlyIncomeMinor({ startDate: '2026-01-01', endDate: null, streams: [] }, '2026-06-30')).toBe(0);
  });

  it('stops at the end of a past phase', () => {
    const streams = [stream('Job', 300000, '2025-01-01')];
    expect(averageMonthlyIncomeMinor({ startDate: '2026-01-01', endDate: '2026-03-31', streams }, '2030-01-01')).toBe(300000);
  });
});

describe('streamsFromLegacyIncome', () => {
  const span = { startDate: '2026-01-01', endDate: null };

  it('turns a plain base income into one open stream from the first day', () => {
    expect(streamsFromLegacyIncome({ baseMinor: 300000, changes: [], ...span })).toEqual([stream('Income', 300000, '2026-01-01')]);
  });

  it('turns no income into no streams', () => {
    expect(streamsFromLegacyIncome({ baseMinor: 0, changes: [], ...span })).toEqual([]);
  });

  it('keeps what an income change used to say on every day: a raise replaces, it does not add', () => {
    const legacy = { baseMinor: 300000, changes: [{ startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: null }], ...span };
    const streams = streamsFromLegacyIncome(legacy);
    expect(monthlyIncomeOn(streams, '2026-03-31')).toBe(300000);
    expect(monthlyIncomeOn(streams, '2026-04-01')).toBe(350000);
    expect(monthlyIncomeOn(streams, '2027-01-01')).toBe(350000);
  });

  it('leaves a stretch without work as a gap', () => {
    const legacy = {
      baseMinor: 300000,
      changes: [{ startDate: '2026-02-01', endDate: '2026-02-28', amountMinor: 0, reason: 'UNEMPLOYMENT' as const }],
      ...span,
    };
    const streams = streamsFromLegacyIncome(legacy);
    expect(monthlyIncomeOn(streams, '2026-01-31')).toBe(300000);
    expect(monthlyIncomeOn(streams, '2026-02-15')).toBe(0);
    expect(monthlyIncomeOn(streams, '2026-03-01')).toBe(300000);
    expect(streams.every(({ amountMinor }) => amountMinor > 0)).toBe(true);
  });

  it('earns the same as the old maths over the whole phase', () => {
    const legacy = { baseMinor: 300000, changes: [{ startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: null }], ...span };
    const earned = earnedIncomeMinor({ ...span, streams: streamsFromLegacyIncome(legacy) }, '2026-04-30');
    expect(earned).toBe(Math.round((300000 * 90 + 350000 * 30) / AVERAGE_DAYS_PER_MONTH));
  });
});

describe('a living phase with income streams', () => {
  const working = phase({ incomeStreams: [stream('Job', 300000, '2026-01-01'), stream('Freelance', 50000, '2026-03-01', '2026-03-31')] });

  it('shows the income of every stream active on the as-of day', () => {
    expect(phaseSnapshot(working, '2026-02-15').monthlyIncomeMinor).toBe(300000);
    expect(phaseSnapshot(working, '2026-03-15').monthlyIncomeMinor).toBe(350000);
  });

  it('shows the income at the end of a past phase and at the start of an upcoming one', () => {
    const past = phase({ endDate: '2026-03-31', incomeStreams: working.incomeStreams });
    expect(phaseSnapshot(past, '2027-01-01').monthlyIncomeMinor).toBe(350000);
    expect(phaseSnapshot(working, '2025-06-01').monthlyIncomeMinor).toBe(300000);
  });

  it('has no income, and a burn equal to the costs, without any stream', () => {
    const sabbatical = phase({ fixedCosts: rent });
    const snapshot = phaseSnapshot(sabbatical, '2026-05-01');
    expect(snapshot.monthlyIncomeMinor).toBe(0);
    expect(snapshot.savingsCapacityMinor).toBe(-100000);
    expect(snapshot.savingsRate).toBeNull();
  });

  it('tells the average over the stay next to the current rate', () => {
    const [entry] = buildTimeline([phase({ fixedCosts: rent, incomeStreams: [stream('Job', 300000, '2026-03-01')] })], '2026-04-30');
    // Current rate: the job runs today. Average: it covered 61 of 120 days.
    expect(entry.monthlyIncomeMinor).toBe(300000);
    expect(entry.savingsCapacityMinor).toBe(200000);
    const months = 120 / AVERAGE_DAYS_PER_MONTH;
    expect(entry.averageMonthlyIncomeMinor).toBe(Math.round(entry.totalIncomeMinor / months));
    expect(entry.averageSavingsCapacityMinor).toBe(entry.averageMonthlyIncomeMinor - 100000);
    expect(entry.averageSavingsRate).toBeCloseTo(entry.averageSavingsCapacityMinor / entry.averageMonthlyIncomeMinor);
  });

  it('answers the average of an upcoming phase with zero and no rate', () => {
    const [entry] = buildTimeline([phase({ startDate: '2030-01-01', fixedCosts: rent, incomeStreams: [stream('Job', 1, '2030-01-01')] })], '2026-01-01');
    expect(entry.averageMonthlyIncomeMinor).toBe(0);
    expect(entry.averageSavingsRate).toBeNull();
  });
});

describe('createLivingPhase income streams', () => {
  it('accepts overlapping streams', () => {
    const created = createLivingPhase(phase({ incomeStreams: [stream('A', 1, '2026-01-01'), stream('B', 1, '2026-01-01')] }));
    expect(created.incomeStreams).toHaveLength(2);
  });

  it('rejects a stream that ends before it starts, a negative or fractional amount, and a blank label', () => {
    const bad = (override: Partial<IncomeStream>) => () => createLivingPhase(phase({ incomeStreams: [{ ...stream('A', 100, '2026-02-10'), ...override }] }));
    expect(bad({ endDate: '2026-02-09' })).toThrow(InvalidLivingPhaseError);
    expect(bad({ amountMinor: -1 })).toThrow(InvalidLivingPhaseError);
    expect(bad({ amountMinor: 1.5 })).toThrow(InvalidLivingPhaseError);
    expect(bad({ label: '  ' })).toThrow(InvalidLivingPhaseError);
  });
});

describe('job lifecycle: every job is its own stream', () => {
  const jobA = stream('Job A', 300000, '2026-01-01', '2026-03-31');
  const jobB = stream('Job B', 200000, '2026-01-01');

  it('stops counting the ended job after its last day while the other keeps counting', () => {
    expect(monthlyIncomeOn([jobA, jobB], '2026-03-31')).toBe(500000);
    expect(monthlyIncomeOn([jobA, jobB], '2026-04-01')).toBe(200000);
  });

  it('is zero once every job has ended', () => {
    const both = [jobA, stream('Job B', 200000, '2026-01-01', '2026-05-15')];
    expect(monthlyIncomeOn(both, '2026-05-16')).toBe(0);
  });

  it('earns for the days each job ran: nothing after the last job ended', () => {
    const jobs = [stream('A', 300000, '2026-01-01', '2026-01-31'), stream('B', 300000, '2026-01-01', '2026-02-28')];
    // January: 2 jobs, February: 1 job, then nothing.
    const earned = earnedIncomeMinor({ streams: jobs, startDate: '2026-01-01', endDate: null }, '2026-06-30');
    expect(earned).toBeGreaterThan(900000 - 20000);
    expect(earned).toBeLessThan(900000 + 20000);
  });
});

describe('one-time income (a benefit deposit)', () => {
  const once = (amountMinor: number, day: string): IncomeStream => ({ label: 'Unemployment benefit', amountMinor, startDate: day, endDate: null, kind: 'ONE_TIME' });
  const span = { startDate: '2026-01-01', endDate: null };

  it('is not a monthly figure: it never shows in the current monthly income', () => {
    expect(monthlyIncomeOn([once(120000, '2026-03-10')], '2026-03-10')).toBe(0);
    expect(monthlyIncomeOn([stream('Job', 300000, '2026-01-01'), once(120000, '2026-03-10')], '2026-03-10')).toBe(300000);
  });

  it('counts once in what was earned, on the day it was paid', () => {
    expect(earnedIncomeMinor({ ...span, streams: [once(120000, '2026-03-10')] }, '2026-06-30')).toBe(120000);
  });

  it('does not count before it is paid', () => {
    expect(earnedIncomeMinor({ ...span, streams: [once(120000, '2026-03-10')] }, '2026-03-09')).toBe(0);
  });

  it('does not count when paid outside the phase', () => {
    expect(earnedIncomeMinor({ startDate: '2026-01-01', endDate: '2026-02-28', streams: [once(120000, '2026-03-10')] }, '2026-06-30')).toBe(0);
    expect(earnedIncomeMinor({ ...span, streams: [once(120000, '2025-12-31')] }, '2026-06-30')).toBe(0);
  });

  it('adds to the average month of the stay', () => {
    // 6 months lived (Jan 1 - Jun 30 is 181 days = 5.95 months): 120000 / 5.95
    const average = averageMonthlyIncomeMinor({ ...span, streams: [once(120000, '2026-03-10')] }, '2026-06-30');
    expect(average).toBeGreaterThan(19000);
    expect(average).toBeLessThan(21000);
  });
});
