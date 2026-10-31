/** Rounds to the nearest whole unit, with exact halves going away from zero (so 2.5 -> 3 and -2.5 -> -3). */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}
