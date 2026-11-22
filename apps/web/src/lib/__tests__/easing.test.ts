import { describe, it, expect } from 'vitest';
import { easeOutExpo, tweenValue, countUpDurationMs, COUNT_UP_FIRST_MS, COUNT_UP_CHANGE_MS } from '../easing';

describe('easeOutExpo', () => {
  it('starts at 0 and ends at exactly 1', () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
  });

  it('clamps progress outside 0 to 1', () => {
    expect(easeOutExpo(-3)).toBe(0);
    expect(easeOutExpo(7)).toBe(1);
  });

  it('decelerates: most of the distance is covered early, and it never goes backwards', () => {
    expect(easeOutExpo(0.25)).toBeGreaterThan(0.75);
    let previous = 0;
    for (let step = 1; step <= 20; step++) {
      const value = easeOutExpo(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('tweenValue', () => {
  it('lands exactly on both ends', () => {
    expect(tweenValue(100, 500, 0)).toBe(100);
    expect(tweenValue(100, 500, 1)).toBe(500);
  });

  it('counts down as well as up', () => {
    expect(tweenValue(500, 100, 0.5)).toBeLessThan(300);
    expect(tweenValue(500, 100, 0.5)).toBeGreaterThan(100);
  });

  it('stays put when there is nothing to move', () => {
    expect(tweenValue(42, 42, 0.3)).toBe(42);
  });

  it('handles negative figures', () => {
    expect(tweenValue(-100, -300, 1)).toBe(-300);
  });
});

describe('countUpDurationMs', () => {
  it('takes the long, authored time when the figure arrives from nothing', () => {
    expect(countUpDurationMs(0)).toBe(COUNT_UP_FIRST_MS);
  });

  it('takes the short time for a change such as a new period', () => {
    expect(countUpDurationMs(468414.03)).toBe(COUNT_UP_CHANGE_MS);
    expect(COUNT_UP_CHANGE_MS).toBeLessThan(COUNT_UP_FIRST_MS);
  });
});
