import React, { useId } from 'react';
import { formatCurrency, type ReportingPeriod } from '../data/sampleChartData';
import { periodReturnTitle } from '../lib/returnForPeriod';

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

interface HeroMetricsProps {
  figures: HeroFigures;
  period: ReportingPeriod;
  periodGain: number;
  periodPercent: number;
  /** The dates the selected period covers, ready to read. */
  periodWindow: string;
  currency: string;
  isRealInflationMode: boolean;
  country: string;
}

const signed = (amount: number, currency: string) => `${amount > 0 ? '+' : ''}${formatCurrency(amount, currency)}`;
const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (amount: number) => (amount >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative');

interface CardProps {
  title: string;
  figure: string;
  percent?: string;
  /** Positive or negative colouring of the figure; omitted for a neutral figure. */
  amount?: number;
  subtitle: string;
  subtitleHint?: string;
  warning?: boolean;
}

/** Title, figure and one subtitle line in fixed rows: the figures of every card sit on the same line. */
function HeroCard({ title, figure, percent, amount, subtitle, subtitleHint, warning }: CardProps) {
  const titleId = useId();
  return (
    <div className="metric-tile hero-card" role="group" aria-labelledby={titleId}>
      <span className="metric-tile__label hero-card__title" id={titleId}>
        {title}
      </span>
      <span className="hero-card__figure">
        <span className={`hero-card__amount${amount === undefined ? '' : ` ${tone(amount)}`}`}>{figure}</span>
        {percent && <span className={`hero-card__percent${amount === undefined ? '' : ` ${tone(amount)}`}`}>{percent}</span>}
      </span>
      <span
        className={`hero-card__subtitle${warning ? ' hero-card__subtitle--warning' : ''}`}
        title={subtitleHint}
        tabIndex={subtitleHint ? 0 : undefined}
      >
        {subtitle}
      </span>
    </div>
  );
}

/** The three headline cards: what you have, what you hold gained, and what you made in the period. */
export const HeroMetrics: React.FC<HeroMetricsProps> = ({ figures, period, periodGain, periodPercent, periodWindow, currency, isRealInflationMode, country }) => {
  const money = (amount: number) => formatCurrency(amount, currency);
  const afterInflation = isRealInflationMode ? ' · after inflation' : '';

  const openProfit = isRealInflationMode ? figures.realOpenProfit : figures.openProfit;
  const soldProfit = isRealInflationMode ? figures.realSoldProfit : figures.soldProfit;
  const openPercent = figures.openCostBasis > 0 ? (openProfit / figures.openCostBasis) * 100 : 0;

  const wholeHistory = period === 'All';
  const returnFigure = wholeHistory ? figures.totalGain : periodGain;
  const returnPercent = wholeHistory ? figures.totalGainPercent : periodPercent;
  // A window comes from the value history, which has no inflation figures: it is always shown as it is.
  const returnTitle = periodReturnTitle(period) + (wholeHistory ? afterInflation : '');

  return (
    <section className="hero-metrics" aria-label="Key figures" title={isRealInflationMode ? `Adjusted for ${country} inflation` : undefined}>
      <HeroCard
        title={`Net worth${afterInflation}`}
        figure={money(isRealInflationMode ? figures.realNetWorth : figures.netWorth)}
        subtitle={
          isRealInflationMode
            ? `Before inflation: ${money(figures.netWorth)}`
            : `Invested: ${money(figures.openMarketValue)} · Cash: ${money(figures.cashBalance)}`
        }
      />

      <HeroCard
        title={`Open positions gain${afterInflation}`}
        figure={signed(openProfit, currency)}
        percent={signedPercent(openPercent)}
        amount={openProfit}
        subtitle={figures.pricesAvailable ? `Cost basis ${money(figures.openCostBasis)} · Worth ${money(figures.openMarketValue)} today` : `Cost basis ${money(figures.openCostBasis)} · Live prices unavailable`}
        warning={!figures.pricesAvailable}
      />

      <HeroCard
        title={returnTitle}
        figure={signed(returnFigure, currency)}
        percent={signedPercent(returnPercent)}
        amount={returnFigure}
        subtitle={wholeHistory ? `Sold ${signed(soldProfit, currency)} · Open ${signed(openProfit, currency)}` : periodWindow}
        subtitleHint={wholeHistory ? `Also counted: dividends ${signed(figures.dividends, currency)} · fees ${figures.totalFees > 0 ? '-' : ''}${money(figures.totalFees)}` : undefined}
      />
    </section>
  );
};

export default HeroMetrics;
