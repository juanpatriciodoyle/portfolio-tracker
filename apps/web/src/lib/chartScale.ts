export interface ValueDomain {
  min: number;
  max: number;
}

/**
 * The range a chart's vertical axis covers for these values: a margin around them so a line never touches the edge, a
 * readable range for an empty or flat chart, and whole numbers at the ends. Pure.
 */
export function valueDomain(values: readonly number[]): ValueDomain {
  const list = values.length ? values : [0];
  let min = Math.min(...list);
  let max = Math.max(...list);
  if (min === 0 && max === 0) {
    max = 1000;
  } else if (min === max) {
    min = min > 0 ? min * 0.9 : min * 1.1 - 10;
    max = max > 0 ? max * 1.1 : max * 0.9 + 10;
  } else {
    const margin = (max - min) * 0.08 || 10;
    min = Math.floor(min - margin);
    max = Math.ceil(max + margin);
  }
  return { min, max };
}

/** Where a value sits on screen: the top of the plot is the domain's maximum. A flat domain sits in the middle. */
export function scaleY(value: number, { min, max }: ValueDomain, top: number, height: number): number {
  return max === min ? top + height / 2 : top + height - ((value - min) / (max - min)) * height;
}

/** Where the n-th of `count` readings sits across the plot: evenly spread, a lone reading in the middle. */
export function scaleX(index: number, count: number, left: number, width: number): number {
  return count <= 1 ? left + width / 2 : left + (index / (count - 1)) * width;
}
