import { describe, expect, it } from 'vitest';
import { summarizeActiveIncome } from '../incomeSummary';

const stream = (label: string, amountMinor: number, startDate: string, endDate: string | null = null) => ({ label, amountMinor, startDate, endDate });
const money = (minor: number) => `€${minor / 100}`;

describe('summarizeActiveIncome', () => {
  it('names the one job paying on the day, with its monthly amount', () => {
    expect(summarizeActiveIncome([stream('Designer', 320_000, '2022-09-01')], '2026-10-31', money)).toBe('Designer · €3200/mo');
  });

  it('reads a stream as paying on its first and its last day', () => {
    const job = [stream('Designer', 100_000, '2026-01-01', '2026-06-30')];
    expect(summarizeActiveIncome(job, '2026-01-01', money)).toBe('Designer · €1000/mo');
    expect(summarizeActiveIncome(job, '2026-06-30', money)).toBe('Designer · €1000/mo');
  });

  it('says since when nothing has paid, the day after the last job ended', () => {
    const job = [stream('Designer', 100_000, '2026-01-01', '2026-06-30')];
    expect(summarizeActiveIncome(job, '2026-07-01', money)).toBe('No income right now · since 2026-07-01');
    expect(summarizeActiveIncome(job, '2025-12-31', money)).toBe('No income right now');
  });

  it('says there is no income when there is none at all', () => {
    expect(summarizeActiveIncome([], '2026-10-31', money)).toBe('No income right now');
  });

  it('adds up overlapping jobs, naming the biggest first', () => {
    const jobs = [stream('Side project', 50_000, '2026-01-01'), stream('Designer', 300_000, '2026-01-01')];
    expect(summarizeActiveIncome(jobs, '2026-10-31', money)).toBe('2 jobs · €3500/mo');
  });

  it('counts a stream that pays nothing as no income', () => {
    expect(summarizeActiveIncome([stream('Break', 0, '2026-01-01')], '2026-10-31', money)).toBe('No income right now');
  });
});

describe('summarizeActiveIncome: lifecycle', () => {
  const day = (value: string) => `on ${value}`;

  it('keeps counting the second job after the first one ended', () => {
    const jobs = [stream('Job A', 300_000, '2026-01-01', '2026-03-31'), stream('Job B', 200_000, '2026-01-01')];
    expect(summarizeActiveIncome(jobs, '2026-03-31', money)).toBe('2 jobs · €5000/mo');
    expect(summarizeActiveIncome(jobs, '2026-04-01', money)).toBe('Job B · €2000/mo');
  });

  it('names the day the pay stopped once every job has ended', () => {
    const jobs = [stream('Job A', 300_000, '2026-01-01', '2026-03-31'), stream('Job B', 200_000, '2026-01-01', '2026-05-12')];
    expect(summarizeActiveIncome(jobs, '2026-06-01', money, day)).toBe('No income right now · since on 2026-05-13');
  });

  it('does not take a one-time deposit for a paycheck', () => {
    const benefit = { ...stream('Benefit', 120_000, '2026-04-10'), kind: 'ONE_TIME' as const };
    expect(summarizeActiveIncome([benefit], '2026-04-10', money)).toBe('No income right now');
  });
});
