/** A holding younger than this has no yearly figure: stretching a few days over a year only exaggerates. */
export const MIN_DAYS_FOR_YEARLY_RETURN = 365;

const DAYS_PER_YEAR = 365;

/** What a holding earns in a typical year, compounding its total return over the days held; null before a full year. */
export function annualisedReturnPercent(totalReturnPercent: number, daysHeld: number): number | null {
  if (daysHeld < MIN_DAYS_FOR_YEARLY_RETURN) return null;
  const growth = 1 + totalReturnPercent / 100;
  if (growth <= 0) return -100;
  return (Math.pow(growth, DAYS_PER_YEAR / daysHeld) - 1) * 100;
}
