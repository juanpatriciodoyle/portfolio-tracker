/** Pure motion maths. The clock and the screen belong to the hooks that call these. */

export const COUNT_UP_FIRST_MS = 900;
export const COUNT_UP_CHANGE_MS = 450;

const clamp01 = (progress: number) => Math.min(1, Math.max(0, progress));

/** Fast start, long soft landing: the curve of a figure settling into place. */
export function easeOutExpo(progress: number): number {
  const t = clamp01(progress);
  return t === 1 ? 1 : 1 - 2 ** (-10 * t);
}

/** The value `progress` of the way from `from` to `to`, landing exactly on `to` at the end. */
export function tweenValue(from: number, to: number, progress: number): number {
  if (from === to) return to;
  const t = clamp01(progress);
  if (t === 0) return from;
  if (t === 1) return to;
  return from + (to - from) * easeOutExpo(t);
}

/** A figure arriving from nothing earns the full entrance; a figure that merely changes moves quickly. */
export const countUpDurationMs = (from: number): number => (from === 0 ? COUNT_UP_FIRST_MS : COUNT_UP_CHANGE_MS);
