import { describe, expect, it } from 'vitest';
import { formatMonths } from '../duration';

describe('formatMonths', () => {
  it.each([
    [0, 'not started yet'],
    [0.3, 'less than a month'],
    [1, '1 month'],
    [1.4, '1 month'],
    [7.6, '8 months'],
    [12, '1 year'],
    [14.2, '1 year 2 months'],
    [24, '2 years'],
    [37, '3 years 1 month'],
  ])('shows %d months as %p', (months, expected) => {
    expect(formatMonths(months)).toBe(expected);
  });
});
