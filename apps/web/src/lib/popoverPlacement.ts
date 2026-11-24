export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PopoverSpace {
  /** How wide the popover is. */
  width: number;
  viewportWidth: number;
  /** The space between the button and the popover. */
  gap: number;
  /** The least space kept between the popover and the edge of the screen. */
  margin: number;
}

/** Where a popover goes: just below its button, lined up with its left edge, slid sideways so it stays on the screen. */
export function placePopover(anchor: AnchorRect, space: PopoverSpace): { top: number; left: number } {
  const farthestLeft = space.viewportWidth - space.margin - space.width;
  return { top: anchor.bottom + space.gap, left: Math.max(space.margin, Math.min(anchor.left, farthestLeft)) };
}

export interface PopoverHeightSpace {
  /** How tall the popover is once drawn. */
  height: number;
  viewportHeight: number;
  gap: number;
  margin: number;
}

/** The popover's top edge: just below its button when it fits there, else just above it, and never off the top of the screen. */
export function placeVertically(anchor: AnchorRect, space: PopoverHeightSpace): number {
  const below = anchor.bottom + space.gap;
  if (below + space.height <= space.viewportHeight - space.margin) return below;
  return Math.max(space.margin, anchor.top - space.gap - space.height);
}
