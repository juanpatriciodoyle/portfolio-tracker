export interface TooltipSize {
  width: number;
  height: number;
}

/** The highest and lowest (screen y) the drawn lines reach over a stretch of the plot. */
export interface LineSpan {
  top: number;
  bottom: number;
}

export interface TooltipPlacementInput {
  /** The crosshair's x, in screen pixels. */
  anchorX: number;
  size: TooltipSize;
  viewport: TooltipSize;
  /** The plot's top and bottom on screen: the side with more room inside it is the side the tooltip takes. */
  plot: { top: number; bottom: number };
  /** The lines between two x positions: asked after the side is chosen, for the columns the tooltip will cover. `null` where none draws. */
  lineSpan: (fromX: number, toX: number) => LineSpan | null;
  /** Where to clear when no line draws under the tooltip: the middle of the plot. */
  fallbackY: number;
  /** Room kept between the tooltip and the crosshair or the line. */
  gap: number;
  /** Room kept from the edge of the screen. */
  margin: number;
}

export interface TooltipPlacement {
  /** Screen position of the tooltip's top left corner. */
  left: number;
  top: number;
  side: 'right' | 'left';
  vertical: 'above' | 'below';
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));

/**
 * Where a chart's tooltip goes so it never sits on the line it describes: beside the crosshair (flipping to its other side
 * near the edge of the screen) and, vertically, clear of every line the tooltip would cover, on whichever side of the lines
 * has more room in the plot. It floats above the page and stays on screen, so a chart's border never cuts it. Pure: the same input always gives the same place.
 */
export function placeTooltip({ anchorX, size, viewport, plot, lineSpan, fallbackY, gap, margin }: TooltipPlacementInput): TooltipPlacement {
  const fitsOnTheRight = anchorX + gap + size.width <= viewport.width - margin;
  const side = fitsOnTheRight ? 'right' : 'left';
  const left = clamp(side === 'right' ? anchorX + gap : anchorX - gap - size.width, margin, viewport.width - margin - size.width);

  const span = lineSpan(left, left + size.width) ?? { top: fallbackY, bottom: fallbackY };
  const roomAbove = span.top - gap - plot.top;
  const roomBelow = plot.bottom - (span.bottom + gap);
  const vertical = roomBelow >= roomAbove ? 'below' : 'above';
  const wanted = vertical === 'below' ? span.bottom + gap : span.top - gap - size.height;

  return { left, top: clamp(wanted, margin, viewport.height - margin - size.height), side, vertical };
}
