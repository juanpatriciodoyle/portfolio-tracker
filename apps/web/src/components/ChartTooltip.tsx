import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeTooltip, type LineSpan } from '../lib/tooltipPlacement';

/** Room kept between the tooltip and the crosshair or the line, and from the edge of the screen. */
const GAP = 16;
const MARGIN = 8;

interface ChartTooltipProps {
  /** The crosshair's x on screen. */
  anchorX: number;
  /** The plot's top and bottom on screen. */
  plot: { top: number; bottom: number };
  /** Where the lines are between two screen x positions: the tooltip clears them. */
  lineSpan: (fromX: number, toX: number) => LineSpan | null;
  children: ReactNode;
}

/**
 * What a chart says about the reading under the pointer. It floats above the page (a portal into the body, fixed to the
 * screen), so no border or edge of the chart can cut it, and it sits beside the crosshair and clear of the lines: the
 * line being read is never covered. It is measured first, hidden, and shown where `placeTooltip` puts it.
 */
export default function ChartTooltip({ anchorX, plot, lineSpan, children }: ChartTooltipProps) {
  const box = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const place = placeTooltip({
      anchorX,
      size: { width: element.offsetWidth, height: element.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      plot,
      lineSpan,
      fallbackY: (plot.top + plot.bottom) / 2,
      gap: GAP,
      margin: MARGIN,
    });
    element.style.left = `${place.left}px`;
    element.style.top = `${place.top}px`;
    element.style.visibility = 'visible';
  });

  return createPortal(
    <div ref={box} className="portfolio-chart-tooltip" role="presentation" style={{ visibility: 'hidden' }}>
      {children}
    </div>,
    document.body
  );
}
