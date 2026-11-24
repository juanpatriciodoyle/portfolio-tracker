import { describe, it, expect } from 'vitest';
import { placeTooltip, type TooltipPlacementInput } from '../tooltipPlacement';

const VIEWPORT = { width: 1200, height: 800 };
const SIZE = { width: 220, height: 80 };

/** The lines run flat at one height, wherever the tooltip lands. */
const flatLine = (y: number) => () => ({ top: y, bottom: y });

const input = (overrides: Partial<TooltipPlacementInput> = {}): TooltipPlacementInput => ({
  anchorX: 500,
  size: SIZE,
  viewport: VIEWPORT,
  plot: { top: 100, bottom: 700 },
  lineSpan: flatLine(400),
  fallbackY: 400,
  gap: 16,
  margin: 8,
  ...overrides,
});

describe('placeTooltip: beside the crosshair, never on the line', () => {
  it('goes to the right of the crosshair, a gap away from it', () => {
    const place = placeTooltip(input());
    expect(place.side).toBe('right');
    expect(place.left).toBe(516);
  });

  it('flips to the left of the crosshair when the right side would leave the screen', () => {
    const place = placeTooltip(input({ anchorX: 1100 }));
    expect(place.side).toBe('left');
    expect(place.left).toBe(1100 - 16 - SIZE.width);
  });

  it('stays inside the screen even when neither side fits', () => {
    const narrow = placeTooltip(input({ anchorX: 100, viewport: { width: 240, height: 800 } }));
    expect(narrow.left).toBeGreaterThanOrEqual(8);
    expect(narrow.left + SIZE.width).toBeLessThanOrEqual(240 - 8);
  });
});

describe('placeTooltip: below a line high up in the plot, above a line low down in it', () => {
  it('goes below the line when the line is in the upper part of the plot (more room underneath)', () => {
    const place = placeTooltip(input({ lineSpan: flatLine(150), fallbackY: 150 }));
    expect(place.vertical).toBe('below');
    expect(place.top).toBe(150 + 16);
  });

  it('goes above the line when the line is in the lower part of the plot (more room above)', () => {
    const place = placeTooltip(input({ lineSpan: flatLine(650), fallbackY: 650 }));
    expect(place.vertical).toBe('above');
    expect(place.top).toBe(650 - 16 - SIZE.height);
  });

  it('never overlaps the lines it was given: it clears the whole span the tooltip covers', () => {
    const span = { top: 300, bottom: 420 };
    const high = placeTooltip(input({ lineSpan: () => span }));
    const clear = high.vertical === 'below' ? high.top >= span.bottom : high.top + SIZE.height <= span.top;
    expect(clear).toBe(true);
  });

  it('asks about the line across the very columns the tooltip will cover', () => {
    const asked: [number, number][] = [];
    placeTooltip(input({ lineSpan: (from, to) => (asked.push([from, to]), { top: 400, bottom: 400 }) }));
    expect(asked).toEqual([[516, 516 + SIZE.width]]);
  });

  it('uses the middle of the plot when no line draws under the tooltip', () => {
    const place = placeTooltip(input({ lineSpan: () => null, fallbackY: 600 }));
    expect(place.vertical).toBe('above');
  });

  it('keeps the tooltip on screen at the top: a line near the top edge with no room anywhere still fits inside', () => {
    const tall = placeTooltip(input({ size: { width: 220, height: 300 }, viewport: { width: 1200, height: 340 }, plot: { top: 8, bottom: 332 }, lineSpan: flatLine(170), fallbackY: 170 }));
    expect(tall.top).toBeGreaterThanOrEqual(8);
    expect(tall.top + 300).toBeLessThanOrEqual(340 - 8);
  });

  it('is the same answer for the same input', () => {
    expect(placeTooltip(input({ lineSpan: flatLine(222) }))).toEqual(placeTooltip(input({ lineSpan: flatLine(222) })));
  });
});
