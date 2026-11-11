import { describe, it, expect } from 'vitest';
import { describePeriodWindow } from '../periodWindow';

describe('describePeriodWindow', () => {
  it('reads the first and last day, with the year once when both are in it', () => {
    expect(describePeriodWindow({ startDate: new Date(2026, 0, 1), endDate: new Date(2026, 10, 11) })).toBe('1 Jan – 11 Nov 2026');
  });

  it('keeps both years when the window crosses one', () => {
    expect(describePeriodWindow({ startDate: new Date(2025, 10, 11), endDate: new Date(2026, 10, 11) })).toBe('11 Nov 2025 – 11 Nov 2026');
  });
});
