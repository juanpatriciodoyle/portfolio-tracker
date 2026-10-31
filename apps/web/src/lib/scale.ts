/**
 * Width of a bar as a percentage of the largest bar beside it. Pure drawing arithmetic: the
 * amounts themselves come from the API.
 */
export function barWidthPercent(value: number, largest: number): number {
  if (!(largest > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / largest) * 100);
}
