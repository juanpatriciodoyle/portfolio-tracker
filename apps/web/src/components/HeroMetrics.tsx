import React from 'react';
import { formatCurrency } from '../data/sampleChartData';
import { periodPhrase } from '../lib/returnForPeriod';
import type { ReportingPeriod } from '../data/sampleChartData';

export interface HeroFigures {
  netWorth: number;
  cashBalance: number;
  /** What the open positions are worth today. */
  openMarketValue: number;
  /** Gain or loss on what is still held (not sold yet). */
  openProfit: number;
  /** Profit already locked in by selling. */
  soldProfit: number;
  dividends: number;
  totalFees: number;
  /** Money put in minus money taken out. */
  totalInvested: number;
  /** Everything gained or lost since the start: sold + held + dividends - buying costs. */
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
  currency: string;
  isRealInflationMode: boolean;
  country: string;
}

const signed = (amount: number, currency: string) => `${amount > 0 ? '+' : ''}${formatCurrency(amount, currency)}`;
const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (amount: number) => (amount >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative');

/** Every headline number in one panel. Each tile answers one plain question and no two show the same figure. */
export const HeroMetrics: React.FC<HeroMetricsProps> = ({ figures, period, periodGain, periodPercent, currency, isRealInflationMode, country }) => {
  const feeShare = figures.totalInvested > 0 ? (figures.totalFees / figures.totalInvested) * 100 : 0;

  return (
    <section className="hero-metrics" aria-label="Key figures">
      <div className="metric-tile">
        <span className="metric-tile__label">Net worth</span>
        <span className="hero-metrics__value">{formatCurrency(figures.netWorth, currency)}</span>
        <span className="hero-metrics__note">Cash: {formatCurrency(figures.cashBalance, currency)}</span>
      </div>

      <div className="metric-tile">
        <span className="metric-tile__label">Still held</span>
        <span className={`hero-metrics__value ${tone(figures.openProfit)}`}>{signed(figures.openProfit, currency)}</span>
        <span className={`hero-metrics__note${figures.pricesAvailable ? '' : ' hero-metrics__note--warning'}`}>
          {figures.pricesAvailable ? `Worth ${formatCurrency(figures.openMarketValue, currency)} today` : 'Live prices unavailable: shown at what it cost'}
        </span>
      </div>

      <div className="metric-tile">
        <span className="metric-tile__label">Total gain or loss</span>
        <span className={`hero-metrics__value ${tone(figures.totalGain)}`}>{signed(figures.totalGain, currency)}</span>
        <span className="hero-metrics__note">
          {`${signedPercent(figures.totalGainPercent)}${isRealInflationMode ? ` after ${country} inflation` : ''}`}
        </span>
        {!isRealInflationMode && (
          <span className="hero-metrics__note">
            Sold {signed(figures.soldProfit, currency)} · Held {signed(figures.openProfit, currency)} · Dividends {signed(figures.dividends, currency)}
          </span>
        )}
      </div>

      <div className="metric-tile">
        <span className="metric-tile__label">Gain {periodPhrase(period)}</span>
        <span className={`hero-metrics__value ${tone(periodGain)}`}>{signed(periodGain, currency)}</span>
        <span className="hero-metrics__note">{signedPercent(periodPercent)}</span>
      </div>

      <div className="metric-tile">
        <span className="metric-tile__label">Fees paid</span>
        <span className={`hero-metrics__value ${figures.totalFees > 0 ? 'metric-tile__value--negative' : ''}`}>
          {figures.totalFees > 0 ? `-${formatCurrency(figures.totalFees, currency)}` : formatCurrency(0, currency)}
        </span>
        <span className="hero-metrics__note">{`${feeShare.toFixed(2)}% of the money you put in`}</span>
      </div>
    </section>
  );
};

export default HeroMetrics;
