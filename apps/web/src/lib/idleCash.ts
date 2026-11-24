/** Cash is "idle" when it is over this share of everything the person has (percent)... */
export const IDLE_CASH_SHARE_LIMIT = 10;
/** ...and over this amount, in the person's currency. A small balance is just a balance. */
export const IDLE_CASH_MIN_AMOUNT = 1000;

const ROUND_TO_TENS_FROM = 100;

export interface IdleCashInput {
  /** Cash, as the home figures give it, in the person's currency. */
  cash: number;
  /** Everything the person has: holdings and cash. */
  total: number;
  /** The yearly price rise of the country chosen behind the header chip, in percent. */
  inflationRatePercent: number | undefined;
  /** Some of the cash is held in another currency. */
  hasForeignCash: boolean;
}

export interface IdleCashNote {
  cash: number;
  sharePercent: number;
  /** About what a year of inflation takes from the cash's buying power. */
  annualLoss: number;
  inflationRatePercent: number;
  hasForeignCash: boolean;
}

/** "About": tens for amounts from 100 up, whole units below. */
const roundAbout = (amount: number): number => (amount >= ROUND_TO_TENS_FROM ? Math.round(amount / 10) * 10 : Math.round(amount));

/** What to say about cash left idle, or null when there is nothing worth saying (a fact, never advice). */
export function idleCashNote(input: IdleCashInput): IdleCashNote | null {
  const { cash, total, inflationRatePercent, hasForeignCash } = input;
  if (inflationRatePercent === undefined || !Number.isFinite(inflationRatePercent) || inflationRatePercent <= 0) return null;
  if (!(total > 0) || !(cash > IDLE_CASH_MIN_AMOUNT)) return null;
  const sharePercent = (cash / total) * 100;
  if (sharePercent <= IDLE_CASH_SHARE_LIMIT) return null;
  return {
    cash,
    sharePercent: Math.round(sharePercent),
    annualLoss: roundAbout((cash * inflationRatePercent) / 100),
    inflationRatePercent,
    hasForeignCash,
  };
}
