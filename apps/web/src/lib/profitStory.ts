import type { PortfolioHistoryResponse } from '../contracts';
import type { Translate } from '../i18n/translate';
import type { PositionItem, SoldAssetItem } from './holdingsRows';

/** With fewer holdings than this there is nothing to compare, so no story is told. */
export const MIN_HOLDINGS_FOR_STORY = 2;
/** At most this many holdings are named as the ones that earned the profit. */
export const MAX_CONTRIBUTORS = 2;
/** One holding over this share of everything the holdings earned is said alone: "most of your profit comes from one holding". */
export const DOMINANT_SHARE_OF_PROFIT = 0.7;
/** A loss is named when it is over this share of the total profit... */
export const DETRACTOR_SHARE_OF_PROFIT = 0.05;
/** ...or over this amount, in the person's currency, whatever the profit. */
export const DETRACTOR_MIN_LOSS = 1000;
/** The world index is compared only once the readings reach back this many months: a shorter stretch proves nothing. */
export const INDEX_MIN_MONTHS = 12;
/** A gap to the index under this share of the portfolio's value is "about the same". */
export const INDEX_SAME_FRACTION = 0.01;

/** One holding, with everything it earned or lost: what is still held plus what selling locked in. */
export interface StoryHolding {
  symbol: string;
  name: string;
  profit: number;
  stillHeld: boolean;
}

export interface IndexComparison {
  /** What the portfolio is worth today. */
  portfolioValue: number;
  /** What the same money would be worth in a world index fund today. */
  indexValue: number;
}

export interface ProfitStoryInput {
  holdings: readonly StoryHolding[];
  /** The profit of the whole history, as the hero shows it. */
  totalProfit: number;
  pricesAvailable: boolean;
  indexComparison: IndexComparison | null;
}

export interface ProfitStory {
  /** The holdings that earned the profit, biggest first; empty when `mostlyOne` says it all. */
  contributors: StoryHolding[];
  mostlyOne: StoryHolding | null;
  detractor: StoryHolding | null;
  /** How far the portfolio is ahead of the index (negative: behind); `same` when the gap is too small to say either. */
  index: { difference: number; same: boolean } | null;
}

/** What each holding earned or lost, open and sold together, from the two lists the stats answer. */
export function storyHoldings(positions: readonly PositionItem[], soldAssets: readonly SoldAssetItem[]): StoryHolding[] {
  const bySymbol = new Map<string, StoryHolding>();
  for (const position of positions) {
    const gain = position.currentValue === undefined ? 0 : position.currentValue - position.investedAmount;
    bySymbol.set(position.symbol, { symbol: position.symbol, name: position.name || position.symbol, profit: gain, stillHeld: true });
  }
  for (const sale of soldAssets) {
    const known = bySymbol.get(sale.symbol);
    bySymbol.set(sale.symbol, known ? { ...known, profit: known.profit + sale.soldProfit } : { symbol: sale.symbol, name: sale.symbol, profit: sale.soldProfit, stillHeld: false });
  }
  return [...bySymbol.values()];
}

/** The calendar day a month count later, in UTC, as "YYYY-MM-DD". */
function monthsLater(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, date)).toISOString().slice(0, 10);
}

/** The world-index figures to compare with, or null until readings reach back twelve months (and while the index price was unknown). */
export function worldIndexComparison(history: PortfolioHistoryResponse, today: Date): IndexComparison | null {
  if (history.realFrom === null) return null;
  if (monthsLater(history.realFrom, INDEX_MIN_MONTHS) > today.toISOString().slice(0, 10)) return null;
  const last = history.points[history.points.length - 1];
  if (!last || last.benchmark_value_in_reporting_currency === null) return null;
  return { portfolioValue: last.portfolio_value_in_reporting_currency, indexValue: last.benchmark_value_in_reporting_currency };
}

function indexGap({ portfolioValue, indexValue }: IndexComparison): { difference: number; same: boolean } {
  const difference = portfolioValue - indexValue;
  return { difference, same: Math.abs(difference) < Math.abs(portfolioValue) * INDEX_SAME_FRACTION };
}

/** What drove the profit, as facts: who earned it, who lost, how the world index compares. Null when there is nothing worth saying. */
export function profitStory({ holdings, totalProfit, pricesAvailable, indexComparison }: ProfitStoryInput): ProfitStory | null {
  if (!pricesAvailable || holdings.length < MIN_HOLDINGS_FOR_STORY) return null;

  const earners = holdings.filter(({ profit }) => profit > 0).sort((a, b) => b.profit - a.profit);
  const losers = holdings.filter(({ profit }) => profit < 0).sort((a, b) => a.profit - b.profit);

  const top = earners[0];
  const earned = earners.reduce((sum, { profit }) => sum + profit, 0);
  const mostlyOne = top && totalProfit > 0 && top.profit / earned > DOMINANT_SHARE_OF_PROFIT ? top : null;
  const worst = losers[0];
  const loss = worst ? -worst.profit : 0;
  const detractor = worst && (loss > DETRACTOR_MIN_LOSS || loss > Math.abs(totalProfit) * DETRACTOR_SHARE_OF_PROFIT) ? worst : null;
  const index = indexComparison ? indexGap(indexComparison) : null;

  const contributors = mostlyOne ? [] : earners.slice(0, MAX_CONTRIBUTORS);
  if (contributors.length === 0 && !mostlyOne && !detractor && !index) return null;
  return { contributors, mostlyOne, detractor, index };
}

export interface StoryWords {
  t: Translate;
  /** An amount in the person's currency, as written on screen. Given the size of a change, never its sign. */
  money: (amount: number) => string;
  /** Names joined the way the language joins them: "A and B". */
  list: (names: string[]) => string;
}

/** The story in the person's language: one short sentence per fact, never a judgement and never advice. */
export function describeProfitStory(story: ProfitStory, { t, money, list }: StoryWords): string {
  const sentences: string[] = [];

  if (story.mostlyOne) {
    sentences.push(t('story.mostlyOne', { name: story.mostlyOne.name }));
  } else if (story.contributors.length > 0) {
    const made = story.contributors.reduce((sum, holding) => sum + holding.profit, 0);
    sentences.push(t('story.made', { count: story.contributors.length, names: list(story.contributors.map((holding) => holding.name)), amount: money(made) }));
  }

  if (story.detractor) {
    sentences.push(t(story.detractor.stillHeld ? 'story.down' : 'story.lost', { name: story.detractor.name, amount: money(-story.detractor.profit) }));
  }

  if (story.index) {
    const { difference, same } = story.index;
    if (same) sentences.push(t('story.index.same'));
    else sentences.push(t(difference > 0 ? 'story.index.less' : 'story.index.more', { amount: money(Math.abs(difference)) }));
  }

  return sentences.join(' ');
}
