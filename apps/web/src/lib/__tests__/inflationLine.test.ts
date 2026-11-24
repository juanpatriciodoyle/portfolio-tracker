import { describe, it, expect } from 'vitest';
import { INFLATION_LINE_MIN_AGE_DAYS, inflationLine, portfolioAgeDays } from '../inflationLine';

const base = { before: 38.4, after: 9.6, ageDays: 400, moneyPutIn: 340000 };

describe('inflationLine: what the profit is after prices rose', () => {
  it('is shown from a year on, with both percentages', () => {
    expect(INFLATION_LINE_MIN_AGE_DAYS).toBe(365);
    expect(inflationLine(base)).toEqual({ before: 38.4, after: 9.6 });
    expect(inflationLine({ ...base, ageDays: 365 })).not.toBeNull();
  });

  it('is not shown before a year: the rise in prices over a few months says nothing', () => {
    expect(inflationLine({ ...base, ageDays: 364 })).toBeNull();
  });

  it('is not shown when no money was put in: there is no percentage to adjust', () => {
    expect(inflationLine({ ...base, moneyPutIn: 0 })).toBeNull();
  });
});

describe('portfolioAgeDays: how long ago the person started', () => {
  const today = new Date('2026-11-24T10:00:00Z');
  const position = (holdingDays?: number) => ({ holdingDays }) as { holdingDays?: number };
  const sold = (holdingDays: number | undefined, date: string) => ({ holdingDays, date });

  it('is the oldest holding still owned', () => {
    expect(portfolioAgeDays([position(120), position(800), position(30)], [], today)).toBe(800);
  });

  it('counts a sold holding from the day it was bought: the days held plus the days since the sale', () => {
    expect(portfolioAgeDays([position(10)], [sold(100, '2026-08-16')], today)).toBe(100 + 100);
  });

  it('is the oldest of all of them', () => {
    expect(portfolioAgeDays([position(500)], [sold(100, '2026-08-16')], today)).toBe(500);
  });

  it('is zero with nothing at all, and ignores a holding whose age is unknown', () => {
    expect(portfolioAgeDays([], [], today)).toBe(0);
    expect(portfolioAgeDays([position(undefined)], [sold(undefined, '2026-08-16')], today)).toBe(0);
  });
});
