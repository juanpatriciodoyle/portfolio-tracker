import type { ReportingPeriod } from '../data/sampleChartData';
import type { MessageKey } from '../i18n/catalogs';
import { translateEnglish, type Translate } from '../i18n/translate';
import { periodPhrase } from './returnForPeriod';

export interface HeroFigures {
  netWorth: number;
  /** What the net worth is worth in today's purchasing power: each deposit eroded since the day it went in. */
  realNetWorth: number;
  cashBalance: number;
  /** What the open positions are worth today. */
  openMarketValue: number;
  /** What the open positions cost. */
  openCostBasis: number;
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
  /** Nothing logged yet: the hero invites a first transaction instead of showing zeros as results. */
  isEmpty: boolean;
  totalValue: { title: string; amount: number; beforeInflation: number | null };
  invested: number;
  cash: number;
  gain: { label: string; amount: number; percent: number; phrase: string };
  /** The split of the whole-history gain; null for a window, whose gain comes from the value history. */
  gainParts: GainPart[] | null;
  /**
   * The two answers to "how much have I made?": what the things still held have gained today, and what selling
   * already locked in. Null for a window. A part that is zero stays, so "nothing sold yet" can be said.
   */
  gainSplit: { stillInvested: number; sold: number } | null;
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
    isEmpty: figures.netWorth === 0 && figures.openCostBasis === 0 && figures.cashBalance === 0,
    totalValue: isRealInflationMode
      ? { title: t('hero.totalValueAfterInflation'), amount: figures.realNetWorth, beforeInflation: figures.netWorth }
      : { title: t('hero.totalValue'), amount: figures.netWorth, beforeInflation: null },
    invested: figures.openMarketValue,
    cash: figures.cashBalance,
    gain: wholeHistory
      ? { label: t('hero.totalProfit'), amount: figures.totalGain, percent: figures.totalGainPercent, phrase }
      : { label: t('hero.profit'), amount: periodGain, percent: periodPercent, phrase },
    gainParts: wholeHistory ? gainParts(input, t) : null,
    gainSplit: wholeHistory
      ? isRealInflationMode
        ? { stillInvested: figures.realOpenProfit, sold: figures.realSoldProfit }
        : { stillInvested: figures.openProfit, sold: figures.soldProfit }
      : null,
    pricesAvailable: figures.pricesAvailable,
  };
}
