import { addMonths } from '../contracts/calendarDate';
import { MONTHS_PER_CADENCE, inferCadenceFromPeriod, maxPeriodDays, periodEndingOn, periodFitsCadence } from '../contracts/billingPeriod';

describe('addMonths', () => {
  it.each([
    ['2026-11-01', -1, '2026-10-01'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2024-03-31', -1, '2024-02-29'],
    ['2026-01-15', -2, '2025-11-15'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-06-10', 0, '2026-06-10'],
    ['2026-06-10', -12, '2025-06-10'],
  ])('%s moved by %i months is %s', (date, count, expected) => {
    expect(addMonths(date, count)).toBe(expected);
  });
});

describe('maxPeriodDays', () => {
  it('allows a little more than the nominal length of each cadence', () => {
    expect(maxPeriodDays('MONTHLY')).toBe(35);
    expect(maxPeriodDays('BIMONTHLY')).toBe(66);
    expect(maxPeriodDays('QUARTERLY')).toBe(100);
    expect(maxPeriodDays('ANNUAL')).toBe(370);
  });

  it('puts no limit on a one-off charge', () => {
    expect(maxPeriodDays('ONE_OFF')).toBeNull();
  });
});

describe('periodFitsCadence', () => {
  it('accepts a period within the grace tolerance and rejects a longer one', () => {
    expect(periodFitsCadence('MONTHLY', '2026-10-01', '2026-10-31')).toBe(true);
    expect(periodFitsCadence('MONTHLY', '2026-10-01', '2026-11-04')).toBe(true); // 35 days
    expect(periodFitsCadence('MONTHLY', '2026-10-01', '2026-11-05')).toBe(false); // 36 days
    expect(periodFitsCadence('BIMONTHLY', '2026-09-01', '2026-11-05')).toBe(true); // 66 days
    expect(periodFitsCadence('BIMONTHLY', '2026-09-01', '2026-11-06')).toBe(false);
    expect(periodFitsCadence('QUARTERLY', '2026-07-01', '2026-10-08')).toBe(true); // 100 days
    expect(periodFitsCadence('QUARTERLY', '2026-07-01', '2026-10-09')).toBe(false);
  });

  it('accepts a shorter period, a single day, and any period for a one-off', () => {
    expect(periodFitsCadence('MONTHLY', '2026-10-10', '2026-10-10')).toBe(true);
    expect(periodFitsCadence('ONE_OFF', '2026-01-01', '2026-12-31')).toBe(true);
  });

  it('rejects a period that ends before it starts', () => {
    expect(periodFitsCadence('MONTHLY', '2026-10-10', '2026-10-09')).toBe(false);
  });
});

describe('inferCadenceFromPeriod', () => {
  it.each([
    ['2026-10-01', '2026-10-31', 'MONTHLY'],
    ['2026-09-01', '2026-10-31', 'BIMONTHLY'],
    ['2026-08-01', '2026-10-31', 'QUARTERLY'],
    ['2026-01-01', '2026-12-31', 'ANNUAL'],
  ])('%s to %s is %s', (start, end, expected) => {
    expect(inferCadenceFromPeriod(start, end)).toBe(expected);
  });

  it('picks the shortest cadence the period fits in', () => {
    expect(inferCadenceFromPeriod('2026-10-01', '2026-10-10')).toBe('MONTHLY');
    expect(inferCadenceFromPeriod('2026-10-01', '2026-11-04')).toBe('MONTHLY');
    expect(inferCadenceFromPeriod('2026-10-01', '2026-11-05')).toBe('BIMONTHLY');
  });

  it('answers null for a period longer than a year or one that runs backwards', () => {
    expect(inferCadenceFromPeriod('2025-01-01', '2026-12-31')).toBeNull();
    expect(inferCadenceFromPeriod('2026-10-10', '2026-10-01')).toBeNull();
  });
});

describe('periodEndingOn', () => {
  it('counts back one cadence from the end day, both ends included', () => {
    expect(periodEndingOn('MONTHLY', '2026-11-01')).toEqual({ periodStart: '2026-10-02', periodEnd: '2026-11-01' });
    expect(periodEndingOn('BIMONTHLY', '2026-11-30')).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-11-30' });
    expect(periodEndingOn('QUARTERLY', '2026-09-30')).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    expect(periodEndingOn('ANNUAL', '2026-12-31')).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31' });
  });

  it('handles a short month at the end', () => {
    expect(periodEndingOn('MONTHLY', '2026-03-31')).toEqual({ periodStart: '2026-03-01', periodEnd: '2026-03-31' });
  });

  it('gives a one-off a single day', () => {
    expect(periodEndingOn('ONE_OFF', '2026-11-01')).toEqual({ periodStart: '2026-11-01', periodEnd: '2026-11-01' });
  });

  it('always produces a period that fits its own cadence', () => {
    for (const cadence of ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'ANNUAL'] as const) {
      for (const end of ['2026-01-31', '2026-02-28', '2024-02-29', '2026-05-31', '2026-12-31']) {
        const { periodStart, periodEnd } = periodEndingOn(cadence, end);
        expect(periodFitsCadence(cadence, periodStart, periodEnd)).toBe(true);
        expect(inferCadenceFromPeriod(periodStart, periodEnd)).toBe(cadence);
      }
    }
  });
});

describe('the every 6 months cadence', () => {
  it('covers six months and allows about 190 days', () => {
    expect(MONTHS_PER_CADENCE.SEMI_ANNUALLY).toBe(6);
    expect(maxPeriodDays('SEMI_ANNUALLY')).toBe(190);
    expect(periodFitsCadence('SEMI_ANNUALLY', '2026-01-01', '2026-07-09')).toBe(true); // 190 days
    expect(periodFitsCadence('SEMI_ANNUALLY', '2026-01-01', '2026-07-10')).toBe(false); // 191 days
  });

  it('is inferred between quarterly and yearly', () => {
    expect(inferCadenceFromPeriod('2026-01-01', '2026-06-30')).toBe('SEMI_ANNUALLY');
    expect(inferCadenceFromPeriod('2026-01-01', '2026-10-31')).toBe('ANNUAL');
  });

  it('starts the day after six months before the end day', () => {
    expect(periodEndingOn('SEMI_ANNUALLY', '2026-07-15')).toEqual({ periodStart: '2026-01-16', periodEnd: '2026-07-15' });
  });
});
