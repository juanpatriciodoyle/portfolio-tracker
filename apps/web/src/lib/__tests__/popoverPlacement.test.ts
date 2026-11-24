import { describe, it, expect } from 'vitest';
import { placePopover, placeVertically } from '../popoverPlacement';

const anchor = (left: number, top = 100, width = 20, height = 20) => ({ left, top, right: left + width, bottom: top + height, width, height });

describe('placePopover', () => {
  it('opens just below the button, lined up with its left edge', () => {
    expect(placePopover(anchor(200), { width: 280, viewportWidth: 1200, gap: 8, margin: 12 })).toEqual({ top: 128, left: 200 });
  });

  it('slides left so it never leaves the right edge of the screen', () => {
    expect(placePopover(anchor(1100), { width: 280, viewportWidth: 1200, gap: 8, margin: 12 })).toEqual({ top: 128, left: 908 });
  });

  it('never leaves the left edge either', () => {
    expect(placePopover(anchor(2), { width: 280, viewportWidth: 1200, gap: 8, margin: 12 }).left).toBe(12);
  });

  it('still starts at the margin on a screen narrower than itself', () => {
    expect(placePopover(anchor(50), { width: 280, viewportWidth: 300, gap: 8, margin: 12 }).left).toBe(12);
  });
});

describe('placeVertically: a popover that is taller than the room below its button goes above it', () => {
  const room = { height: 150, viewportHeight: 900, gap: 8, margin: 12 };

  it('stays just below the button when it fits', () => {
    expect(placeVertically(anchor(0, 100), room)).toBe(128);
  });

  it('goes above the button when the room below is not enough', () => {
    // The button is at 800-820: 150 high does not fit in the 80 left below it, but does above.
    expect(placeVertically(anchor(0, 800), room)).toBe(800 - 8 - 150);
  });

  it('never leaves the top of the screen either', () => {
    expect(placeVertically(anchor(0, 40), { ...room, viewportHeight: 120 })).toBe(12);
  });
});
