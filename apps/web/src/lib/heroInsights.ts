import type { PortfolioHistoryResponse } from '../contracts';
import type { ReportingPeriod } from '../data/sampleChartData';
import type { Translate } from '../i18n/translate';
import { inflationLine, portfolioAgeDays, type InflationLine } from './inflationLine';
import type { PositionItem, SoldAssetItem } from './holdingsRows';
import { currencyExponent, formatMinor } from './money';
import { describeProfitStory, profitStory, storyHoldings, worldIndexComparison } from './profitStory';

export interface HeroInsightsInput {
  positions: readonly PositionItem[];
  soldAssets: readonly SoldAssetItem[];
  /** The profit of the whole history, before inflation. */
  totalProfit: number;
  moneyPutIn: number;
  pricesAvailable: boolean;
  /** The whole-history return in percent, before and after inflation. */
  nominalPercent: number;
  realPercent: number;
  history: PortfolioHistoryResponse;
  period: ReportingPeriod;
  isRealInflationMode: boolean;
  currency: string;
  locale: string;
  t: Translate;
  today: Date;
}

export interface HeroInsights {
  /** One or two plain sentences about what drove the profit; null when there is nothing worth saying. */
  story: string | null;
  inflation: InflationLine | null;
}

/**
 * What the home screen adds under its two figures. Both speak about the whole history, so a window of time has neither;
 * and while the inflation switch is on the hero already shows the adjusted figures, which the holdings' own profits are not.
 */
export function heroInsights(input: HeroInsightsInput): HeroInsights {
  if (input.period !== 'All') return { story: null, inflation: null };

  const inflation = inflationLine({
    before: input.nominalPercent,
    after: input.realPercent,
    ageDays: portfolioAgeDays(input.positions, input.soldAssets, input.today),
    moneyPutIn: input.moneyPutIn,
  });
  if (input.isRealInflationMode) return { story: null, inflation };

  const story = profitStory({
    holdings: storyHoldings(input.positions, input.soldAssets),
    totalProfit: input.totalProfit,
    pricesAvailable: input.pricesAvailable,
    indexComparison: worldIndexComparison(input.history, input.today),
  });
  if (!story) return { story: null, inflation };

  const list = new Intl.ListFormat(input.locale, { style: 'long', type: 'conjunction' });
  return {
    story: describeProfitStory(story, {
      t: input.t,
      money: (amount) => formatMinor(Math.round(amount) * 10 ** currencyExponent(input.currency), input.currency, input.locale),
      list: (names) => list.format(names),
    }),
    inflation,
  };
}
