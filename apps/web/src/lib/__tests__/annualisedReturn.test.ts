import { describe, it, expect } from 'vitest';
import { annualisedReturnPercent, MIN_DAYS_FOR_YEARLY_RETURN } from '../annualisedReturn';

describe('annualisedReturnPercent', () => {
  it('is empty before a full year: a short period would only exaggerate', () => {
    expect(MIN_DAYS_FOR_YEARLY_RETURN).toBe(365);
    expect(annualisedReturnPercent(64, 1)).toBeNull();
    expect(annualisedReturnPercent(50.59, 1)).toBeNull();
    expect(annualisedReturnPercent(10, 364)).toBeNull();
  });

  it('is the total return itself after exactly a year', () => {
    expect(annualisedReturnPercent(10, 365)).toBeCloseTo(10, 6);
  });

  it('spreads a longer gain over its years, compounding', () => {
    // +21% over two years is 10% a year.
    expect(annualisedReturnPercent(21, 730)).toBeCloseTo(10, 1);
    // +100% over 4 years is about 18.9% a year.
    expect(annualisedReturnPercent(100, 4 * 365)).toBeCloseTo(18.92, 1);
  });

  it('handles a loss', () => {
    expect(annualisedReturnPercent(-19, 730)).toBeCloseTo(-10, 1);
  });

  it('never goes below losing everything', () => {
    expect(annualisedReturnPercent(-100, 730)).toBe(-100);
    expect(annualisedReturnPercent(-140, 730)).toBe(-100);
  });

  it('is zero for no gain', () => {
    expect(annualisedReturnPercent(0, 1000)).toBe(0);
  });
});
