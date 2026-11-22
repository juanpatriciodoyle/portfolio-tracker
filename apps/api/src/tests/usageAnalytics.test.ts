import { activeWindowStart, usageSummary } from '../domain/usageAnalytics';

const day = (iso: string) => new Date(`${iso}T10:30:00.000Z`);
const startOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('activeWindowStart', () => {
  it('goes back whole calendar months and starts at the beginning of that day', () => {
    expect(activeWindowStart(day('2026-11-22'), 3)).toEqual(startOf('2026-08-22'));
  });

  it('crosses the turn of the year', () => {
    expect(activeWindowStart(day('2026-01-15'), 3)).toEqual(startOf('2025-10-15'));
  });

  it('lands on the last day of a shorter month instead of spilling into the next', () => {
    expect(activeWindowStart(day('2026-05-31'), 3)).toEqual(startOf('2026-02-28'));
    expect(activeWindowStart(day('2028-05-31'), 3)).toEqual(startOf('2028-02-29'));
    expect(activeWindowStart(day('2026-03-31'), 1)).toEqual(startOf('2026-02-28'));
  });

  it('keeps the day when the month is long enough', () => {
    expect(activeWindowStart(day('2026-11-30'), 3)).toEqual(startOf('2026-08-30'));
    expect(activeWindowStart(day('2026-03-31'), 3)).toEqual(startOf('2025-12-31'));
  });
});

describe('usageSummary', () => {
  const asOf = day('2026-11-22');
  const windowStart = startOf('2026-08-22');

  it('reports the counts, the share that is active and the two dates', () => {
    expect(usageSummary({ registered: 8, active: 5, asOf, windowStart })).toEqual({
      registered: 8,
      active: 5,
      activePercent: 62.5,
      activeSince: '2026-08-22',
      asOf: '2026-11-22',
    });
  });

  it('rounds the share to one decimal', () => {
    expect(usageSummary({ registered: 3, active: 1, asOf, windowStart }).activePercent).toBe(33.3);
    expect(usageSummary({ registered: 3, active: 2, asOf, windowStart }).activePercent).toBe(66.7);
  });

  it('says 0% when nobody is registered, never NaN', () => {
    expect(usageSummary({ registered: 0, active: 0, asOf, windowStart }).activePercent).toBe(0);
  });

  it('never goes over 100% when someone signs up between the two counts', () => {
    expect(usageSummary({ registered: 4, active: 5, asOf, windowStart })).toMatchObject({ registered: 4, active: 4, activePercent: 100 });
  });

  it('a registered customer who never signed in counts as registered only', () => {
    expect(usageSummary({ registered: 2, active: 0, asOf, windowStart })).toMatchObject({ active: 0, activePercent: 0 });
  });
});
