import { describe, it, expect } from 'vitest';
import { scaleX, scaleY, valueDomain } from '../chartScale';

describe('valueDomain', () => {
  it('adds an 8% margin on both sides and rounds outward', () => {
    expect(valueDomain([100, 200])).toEqual({ min: 92, max: 208 });
  });

  it('gives an empty chart a readable 0 to 1,000', () => {
    expect(valueDomain([])).toEqual({ min: 0, max: 1000 });
    expect(valueDomain([0, 0])).toEqual({ min: 0, max: 1000 });
  });

  it('makes room around a line that never moves', () => {
    const above = valueDomain([500, 500]);
    expect([above.min, above.max]).toEqual([450, 550]);
    const below = valueDomain([-100, -100]);
    expect(below.min).toBeCloseTo(-120);
    expect(below.max).toBeCloseTo(-80);
  });

  it('keeps zero inside when the values cross it', () => {
    const { min, max } = valueDomain([-50, 150]);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(150);
  });
});

describe('scaleY', () => {
  const domain = { min: 0, max: 100 };
  it('puts the lowest value on the bottom and the highest on the top of the plot', () => {
    expect(scaleY(0, domain, 20, 200)).toBe(220);
    expect(scaleY(100, domain, 20, 200)).toBe(20);
    expect(scaleY(50, domain, 20, 200)).toBe(120);
  });

  it('centres a flat domain', () => {
    expect(scaleY(7, { min: 3, max: 3 }, 20, 200)).toBe(120);
  });
});

describe('scaleX', () => {
  it('spreads the readings evenly from the left edge to the right edge', () => {
    expect(scaleX(0, 5, 72, 400)).toBe(72);
    expect(scaleX(2, 5, 72, 400)).toBe(272);
    expect(scaleX(4, 5, 72, 400)).toBe(472);
  });

  it('puts a single reading in the middle', () => {
    expect(scaleX(0, 1, 72, 400)).toBe(272);
  });
});
