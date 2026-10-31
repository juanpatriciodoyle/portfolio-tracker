import {
  AVERAGE_DAYS_PER_MONTH,
  addDays,
  calendarDateOf,
  compareCalendarDates,
  daysInMonth,
  daysInclusive,
  epochDay,
  firstDayOf,
  lastDayOf,
  monthOf,
  monthsEndingAt,
  previousMonth,
} from '../domain/calendarDate';

describe('epochDay', () => {
  it('counts whole days from 1970-01-01', () => {
    expect(epochDay('1970-01-01')).toBe(0);
    expect(epochDay('1970-01-02')).toBe(1);
    expect(epochDay('1969-12-31')).toBe(-1);
  });

  it('knows about leap days', () => {
    expect(epochDay('2024-03-01') - epochDay('2024-02-28')).toBe(2);
    expect(epochDay('2023-03-01') - epochDay('2023-02-28')).toBe(1);
  });
});

describe('daysInclusive', () => {
  it('counts both the first and the last day', () => {
    expect(daysInclusive('2024-01-01', '2024-01-01')).toBe(1);
    expect(daysInclusive('2024-01-01', '2024-01-31')).toBe(31);
    expect(daysInclusive('2024-02-01', '2024-02-29')).toBe(29);
  });

  it('is zero when the end comes before the start', () => {
    expect(daysInclusive('2024-02-02', '2024-02-01')).toBe(0);
  });
});

describe('compareCalendarDates', () => {
  it('orders dates chronologically', () => {
    expect(compareCalendarDates('2024-01-31', '2024-02-01')).toBeLessThan(0);
    expect(compareCalendarDates('2025-01-01', '2024-12-31')).toBeGreaterThan(0);
    expect(compareCalendarDates('2024-05-05', '2024-05-05')).toBe(0);
  });
});

describe('calendarDateOf', () => {
  it('names the UTC calendar day of an instant', () => {
    expect(calendarDateOf(new Date('2026-10-31T23:59:59.999Z'))).toBe('2026-10-31');
    expect(calendarDateOf(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11-01');
  });
});

describe('calendar months', () => {
  it('names the month of a day and the month before', () => {
    expect(monthOf('2026-10-31')).toBe('2026-10');
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('lists the months ending at a month, oldest first', () => {
    expect(monthsEndingAt('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthsEndingAt('2026-09', 1)).toEqual(['2026-09']);
    expect(monthsEndingAt('2026-09', 12)).toHaveLength(12);
    expect(monthsEndingAt('2026-09', 12)[0]).toBe('2025-10');
  });

  it('knows how long a month is, and its first and last day', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2023-02')).toBe(28);
    expect(daysInMonth('2026-12')).toBe(31);
    expect(firstDayOf('2026-04')).toBe('2026-04-01');
    expect(lastDayOf('2024-02')).toBe('2024-02-29');
    expect(lastDayOf('2026-04')).toBe('2026-04-30');
  });
});

describe('addDays', () => {
  it('moves forward and backward across month, year and leap days', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-10-31', 0)).toBe('2026-10-31');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('AVERAGE_DAYS_PER_MONTH', () => {
  it('matches the 30.44-day month used by the inflation maths', () => {
    expect(AVERAGE_DAYS_PER_MONTH).toBe(30.44);
  });
});
