/** The inflation line appears once the person has been investing this long (days): over a shorter stretch prices barely moved. */
export const INFLATION_LINE_MIN_AGE_DAYS = 365;

const MS_PER_DAY = 86_400_000;

/** The whole-history return in percent: as it is, and after the rise in prices over the years it was held. */
export interface InflationLine {
  before: number;
  after: number;
}

export function inflationLine(input: { before: number; after: number; ageDays: number; moneyPutIn: number }): InflationLine | null {
  if (input.ageDays < INFLATION_LINE_MIN_AGE_DAYS || !(input.moneyPutIn > 0)) return null;
  return { before: input.before, after: input.after };
}

interface HeldFor {
  holdingDays?: number;
}

interface SoldOn extends HeldFor {
  /** The day it was sold, "YYYY-MM-DD". */
  date: string;
}

/** Days since the oldest holding was bought (still owned or sold), from the two lists the stats answer. */
export function portfolioAgeDays(positions: readonly HeldFor[], soldAssets: readonly SoldOn[], today: Date): number {
  const owned = positions.map(({ holdingDays }) => holdingDays ?? 0);
  const sold = soldAssets.map(({ holdingDays, date }) =>
    holdingDays === undefined ? 0 : holdingDays + Math.max(0, Math.floor((today.getTime() - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / MS_PER_DAY)),
  );
  return Math.max(0, ...owned, ...sold);
}
