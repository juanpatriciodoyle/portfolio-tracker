import { describe, it, expect } from 'vitest';
import { paginate } from '../pagination';

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('paginate', () => {
  it('returns the first page by default', () => {
    expect(paginate(items, 0, 5)).toEqual({ items: [1, 2, 3, 4, 5], page: 0, pageCount: 3, hasPrevious: false, hasNext: true });
  });

  it('returns a partial last page', () => {
    expect(paginate(items, 2, 5)).toEqual({ items: [11, 12], page: 2, pageCount: 3, hasPrevious: true, hasNext: false });
  });

  it('clamps an out-of-range page', () => {
    expect(paginate(items, 99, 5).page).toBe(2);
    expect(paginate(items, -3, 5).page).toBe(0);
  });

  it('handles an empty list as a single empty page', () => {
    expect(paginate([], 0, 5)).toEqual({ items: [], page: 0, pageCount: 1, hasPrevious: false, hasNext: false });
  });

  it('handles exactly one full page', () => {
    expect(paginate([1, 2, 3, 4, 5], 0, 5).pageCount).toBe(1);
  });
});
