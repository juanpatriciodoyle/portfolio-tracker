import type { ReportingPeriod } from '../data/sampleChartData';
import type { MessageKey } from '../i18n/catalogs';
import { translateEnglish, type Translate } from '../i18n/translate';
import { periodPhrase } from './returnForPeriod';

export interface HeroFigures {
  netWorth: number;
  /** What the net worth is worth in today's purchasing power: each deposit eroded since the day it went in. */
  realNetWorth: number;
  cashBalance: number;
  /** The money the person put in, minus what they took out. Dividends and the cash a purchase drew on are not part of it. */
  moneyPutIn: number;
  /** What the open positions are worth today. */
  openMarketValue: number;
  /** Gain or loss on what is still held (not sold yet). */
  openProfit: number;
  /** The same, after the inflation lost while each asset was held. */
  realOpenProfit: number;
  /** Profit already locked in by selling, and the same after inflation. */
  soldProfit: number;
  realSoldProfit: number;
  dividends: number;
  totalFees: number;
  /** Everything gained or lost since the start (after inflation while that toggle is on). */
  totalGain: number;
  totalGainPercent: number;
  /** False when a market price was unavailable, so a held asset is shown at what it cost. */
  pricesAvailable: boolean;
}

export interface HeroSummaryInput {
  figures: HeroFigures;
  period: ReportingPeriod;
  periodGain: number;
  periodPercent: number;
  isRealInflationMode: boolean;
}

export type GainPartKey = 'held' | 'sold' | 'dividends' | 'fees' | 'dividendsAndFees';

/** One line of "how the gain adds up", with what it means in plain words. */
export interface GainPart {
  key: GainPartKey;
  label: string;
  meaning: string;
  amount: number;
}

export interface HeroSummary {
  totalValue: { title: string; amount: number; beforeInflation: number | null };
  /** What the things still held are worth today (market value, or cost when no price is known). */
  holdingsValue: number;
  cash: number;
  /** The money put in; the hero says it under the total value so value and contribution are never confused. */
  moneyPutIn: number;
  /** `percent` is null when there is nothing to measure it against (no money put in yet): the hero then shows no percentage. */
  gain: { label: string; amount: number; percent: number | null; phrase: string };
  /** The split of the whole-history gain; null for a window, whose gain comes from the value history. */
  gainParts: GainPart[] | null;
  pricesAvailable: boolean;
}

const toCents = (amount: number) => Math.round(amount * 100) / 100;

const MEANINGS: Record<GainPartKey, { label: MessageKey; meaning: MessageKey }> = {
  held: { label: 'hero.part.held', meaning: 'hero.part.held.meaning' },
  sold: { label: 'hero.part.sold', meaning: 'hero.part.sold.meaning' },
  dividends: { label: 'hero.part.dividends', meaning: 'hero.part.dividends.meaning' },
  fees: { label: 'hero.part.fees', meaning: 'hero.part.fees.meaning' },
  dividendsAndFees: { label: 'hero.part.dividendsAndFees', meaning: 'hero.part.dividendsAndFees.meaning' },
};

const part = (key: GainPartKey, amount: number, t: Translate): GainPart => ({
  key,
  label: t(MEANINGS[key].label),
  meaning: t(MEANINGS[key].meaning),
  amount,
});

/** The ledger of the gain. Whatever the split, its lines always add up to the total gain shown above it. */
function gainParts({ figures, isRealInflationMode }: HeroSummaryInput, t: Translate): GainPart[] {
  const held = isRealInflationMode ? figures.realOpenProfit : figures.openProfit;
  const sold = isRealInflationMode ? figures.realSoldProfit : figures.soldProfit;
  const parts = [part('held', held, t), part('sold', sold, t)];

  if (isRealInflationMode) {
    parts.push(part('dividendsAndFees', toCents(figures.totalGain - held - sold), t));
  } else {
    parts.push(part('dividends', figures.dividends, t), part('fees', -figures.totalFees, t));
  }
  return parts.filter((line) => line.amount !== 0);
}

/** What the home screen says, decided once: the layer that draws it only formats and animates. */
export function heroSummary(input: HeroSummaryInput, t: Translate = translateEnglish): HeroSummary {
  const { figures, period, periodGain, periodPercent, isRealInflationMode } = input;
  const wholeHistory = period === 'All';

  const phrase = periodPhrase(period, t) + (wholeHistory && isRealInflationMode ? t('hero.afterInflation') : '');

  return {
    totalValue: isRealInflationMode
      ? { title: t('hero.totalValueAfterInflation'), amount: figures.realNetWorth, beforeInflation: figures.netWorth }
      : { title: t('hero.totalValue'), amount: figures.netWorth, beforeInflation: null },
    holdingsValue: figures.openMarketValue,
    cash: figures.cashBalance,
    moneyPutIn: figures.moneyPutIn,
    gain: wholeHistory
      ? { label: t('hero.totalProfit'), amount: figures.totalGain, percent: figures.moneyPutIn > 0 ? figures.totalGainPercent : null, phrase }
      : { label: t('hero.profit'), amount: periodGain, percent: periodPercent, phrase },
    gainParts: wholeHistory ? gainParts(input, t) : null,
    pricesAvailable: figures.pricesAvailable,
  };
}
