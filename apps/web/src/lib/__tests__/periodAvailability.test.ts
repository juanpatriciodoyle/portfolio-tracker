import { describe, expect, it } from 'vitest';
import { availablePeriods } from '../periodAvailability';

// Noon, so the local and the UTC calendar agree on the day wherever the tests run.
const TODAY = new Date(2026, 5, 15, 12);

describe('availablePeriods: only windows with real readings behind them', () => {
  it('offers only "All" before any reading exists', () => {
    expect(availablePeriods(null, TODAY)).toEqual(['All']);
  });

  it('offers only "All" on the first day: there is nothing to compare yet', () => {
    expect(availablePeriods('2026-06-15', TODAY)).toEqual(['All']);
  });

  it('does not mistake the local day for the reading day: a reading taken today (UTC) is not an earlier one', () => {
    // 00:30 on 16 June in Madrid is still 15 June in UTC, the day the first reading was taken.
    const justAfterLocalMidnight = new Date(Date.UTC(2026, 5, 15, 22, 30));
    expect(availablePeriods('2026-06-15', justAfterLocalMidnight)).toEqual(['All']);
  });

  it('offers a custom range as soon as there are two real days', () => {
    expect(availablePeriods('2026-06-14', TODAY)).toEqual(['All', 'Custom']);
  });

  it('offers a month once the readings reach back a month', () => {
    expect(availablePeriods('2026-05-16', TODAY)).toEqual(['All', 'Custom']);
    expect(availablePeriods('2026-05-15', TODAY)).toEqual(['All', '1M', 'Custom']);
  });

  it('offers three months, and year to date, once the readings reach their start', () => {
    expect(availablePeriods('2026-03-15', TODAY)).toEqual(['All', '3M', '1M', 'Custom']);
    expect(availablePeriods('2026-01-01', TODAY)).toEqual(['All', 'YTD', '3M', '1M', 'Custom']);
  });

  it('offers a year only after a full year of readings', () => {
    expect(availablePeriods('2025-06-16', TODAY)).toEqual(['All', 'YTD', '3M', '1M', 'Custom']);
    expect(availablePeriods('2025-06-15', TODAY)).toEqual(['All', '1Y', 'YTD', '3M', '1M', 'Custom']);
  });

  it('never offers a window that starts before the first reading', () => {
    expect(availablePeriods('2026-06-01', TODAY)).toEqual(['All', 'Custom']);
  });
});
