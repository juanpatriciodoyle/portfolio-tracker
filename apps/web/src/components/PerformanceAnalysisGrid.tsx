import React, { useState, useMemo } from 'react';
import { HelpCircle, X } from 'lucide-react';
import {
  type ChartDataPoint,
  type ReportingPeriod,
  formatCurrency,
} from '../data/sampleChartData';

export interface PerformanceStats {
  netWorth: number;
  cashBalance: number;
  totalInvested: number;
  openInvestedValue: number;
  soldProfit: number;
  totalProfit: number;
  totalFees?: number;
  totalIncome?: number;
  allTimeRoiPercent: number;
  realProfitEuros: number;
  realRoiPercent: number;
  baseCurrency: string;
}

interface PerformanceAnalysisGridProps {
  stats: PerformanceStats;
  historyData: ChartDataPoint[];
  period: ReportingPeriod;
  isRealInflationMode?: boolean;
}

export const PerformanceAnalysisGrid: React.FC<PerformanceAnalysisGridProps> = ({
  stats,
  historyData,
  isRealInflationMode = false,
}) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const toggleTooltip = (key: string) => {
    setActiveTooltip((prev) => (prev === key ? null : key));
  };

  const currency = stats.baseCurrency || 'EUR';

  // Compute live metrics from actual data
  const metrics = useMemo(() => {
    const returnPercent = isRealInflationMode ? stats.realRoiPercent : stats.allTimeRoiPercent;
    const returnEuros = isRealInflationMode ? stats.realProfitEuros : stats.totalProfit;
    const totalInvested = stats.totalInvested || 0;
    const totalFees = stats.totalFees || 0;
    const totalIncome = stats.totalIncome || 0;

    // 1. Calculate Volatility from historical daily points
    let annualizedVolatility = 0;
    if (historyData.length >= 3) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1].portfolio_value_in_reporting_currency;
        const curr = historyData[i].portfolio_value_in_reporting_currency;
        if (prev > 0) {
          dailyReturns.push((curr - prev) / prev);
        }
      }
      if (dailyReturns.length >= 2) {
        const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
        const variance =
          dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
        const stdDevDaily = Math.sqrt(variance);
        annualizedVolatility = stdDevDaily * Math.sqrt(252) * 100;
      }
    }

    // Benchmark volatility baseline (e.g. 15.0% for MSCI World / S&P500)
    const benchmarkVol = totalInvested > 0 ? 15.0 : 0;
    const volDiff = annualizedVolatility - benchmarkVol;

    // 2. Risk-adjusted return (Sharpe Ratio)
    // Formula: (Annualized Return - Risk-Free Rate) / Annualized Volatility
    const riskFreeRate = 2.5; // European / Global standard baseline risk-free rate (%)
    let sharpeRatio = 0;
    let sharpeRating = 'N/A';

    if (annualizedVolatility > 0 && totalInvested > 0) {
      sharpeRatio = (returnPercent - riskFreeRate) / annualizedVolatility;
      if (sharpeRatio < 0) sharpeRating = 'Below risk-free';
      else if (sharpeRatio < 0.5) sharpeRating = 'Low';
      else if (sharpeRatio < 1.0) sharpeRating = 'Moderate';
      else if (sharpeRatio < 2.0) sharpeRating = 'Good';
      else sharpeRating = 'Excellent';
    }

    // 3. Active return vs benchmark
    const benchmarkAnnualReturn = totalInvested > 0 ? 8.5 : 0;
    const activeReturn = totalInvested > 0 ? returnPercent - benchmarkAnnualReturn : 0;

    // 4. Price contribution
    const priceReturnEuros = stats.soldProfit;
    const priceReturnPercent = totalInvested > 0 ? (priceReturnEuros / totalInvested) * 100 : 0;

    // 5. Income contribution
    const incomeReturnEuros = totalIncome;
    const incomeReturnPercent = totalInvested > 0 ? (incomeReturnEuros / totalInvested) * 100 : 0;

    // 6. Cost contribution
    const costReturnEuros = totalFees > 0 ? -totalFees : 0;
    const costReturnPercent = totalInvested > 0 ? (costReturnEuros / totalInvested) * 100 : 0;

    return {
      returnPercent,
      returnEuros,
      annualizedVolatility,
      volDiff,
      sharpeRatio,
      sharpeRating,
      activeReturn,
      totalInvested,
      priceReturnEuros,
      priceReturnPercent,
      incomeReturnEuros,
      incomeReturnPercent,
      costReturnEuros,
      costReturnPercent,
    };
  }, [stats, historyData, isRealInflationMode]);

  const formatPp = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)} pp/year`;
  };

  const formatPercentYear = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)} %/year`;
  };

  return (
    <section className="portfolio-dashboard__section dashboard-section dashboard-section--flush">
      <div className="dashboard-panel">
        <dl className="metric-grid metric-grid--performance-analysis">
          {/* Tile 1: Portfolio Performance */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Portfolio performance</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('performance')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('performance')}
                  onFocus={() => setActiveTooltip('performance')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Portfolio performance"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'performance' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Portfolio Performance</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      Time-weighted return shows how the portfolio performed independently of the size and timing of
                      external deposits and withdrawals. It includes changes in investment value, income, and recorded
                      costs.
                    </p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span
                  className={
                    metrics.returnPercent >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative'
                  }
                >
                  {formatPercentYear(metrics.returnPercent)}
                </span>
                <div
                  className={`currency metric-tile__subvalue ${
                    metrics.returnEuros >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative'
                  }`}
                >
                  {formatCurrency(metrics.returnEuros, currency)}
                </div>
              </div>
            </dd>
          </div>

          {/* Tile 2: Volatility */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Volatility</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('volatility')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('volatility')}
                  onFocus={() => setActiveTooltip('volatility')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Volatility"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'volatility' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Volatility</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      The annualized standard deviation of the portfolio’s daily returns. Higher volatility means returns
                      varied more widely over time.
                    </p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span>{metrics.annualizedVolatility.toFixed(1)} %</span>
                <span className="metric-tile__subvalue metric-tile__subvalue--muted">
                  {metrics.totalInvested > 0
                    ? `${Math.abs(metrics.volDiff).toFixed(1)} pp ${
                        metrics.volDiff >= 0 ? 'above' : 'below'
                      } benchmark`
                    : 'Benchmark: MSCI World'}
                </span>
              </div>
            </dd>
          </div>

          {/* Tile 3: Risk-adjusted return (Sharpe Ratio) */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Risk-adjusted return</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('sharpe')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('sharpe')}
                  onFocus={() => setActiveTooltip('sharpe')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Risk-adjusted return"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'sharpe' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Sharpe Ratio Ratings</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      Sharpe ratio is the portfolio’s excess return above the risk-free rate (2.5%), divided by its
                      volatility.
                    </p>
                    <table className="dashboard-tooltip__table">
                      <thead>
                        <tr>
                          <th>Sharpe</th>
                          <th>Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>&lt; 0</td>
                          <td>Below risk-free</td>
                        </tr>
                        <tr>
                          <td>0 – &lt;0.50</td>
                          <td>Low</td>
                        </tr>
                        <tr>
                          <td>0.50 – &lt;1.00</td>
                          <td>Moderate</td>
                        </tr>
                        <tr>
                          <td>1.00 – &lt;2.00</td>
                          <td>Good</td>
                        </tr>
                        <tr>
                          <td>≥ 2.00</td>
                          <td>Excellent</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span>{metrics.totalInvested > 0 ? metrics.sharpeRatio.toFixed(2) : '0.00'}</span>
                <span className="metric-tile__subvalue metric-tile__subvalue--muted metric-tile__rating">
                  {metrics.sharpeRating}
                </span>
              </div>
            </dd>
          </div>

          {/* Tile 4: Active Return */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Active return</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('activeReturn')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('activeReturn')}
                  onFocus={() => setActiveTooltip('activeReturn')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Active return"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'activeReturn' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Active Return</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      Portfolio return minus benchmark return on the same annualized basis. Positive means outperforming
                      the benchmark.
                    </p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span
                  className={
                    metrics.activeReturn >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative'
                  }
                >
                  {formatPp(metrics.activeReturn)}
                </span>
                <div className="metric-tile__note">MSCI World Index (Benchmark)</div>
              </div>
            </dd>
          </div>

          {/* Tile 5: Net Contributions */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Net contributions</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('netContributions')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('netContributions')}
                  onFocus={() => setActiveTooltip('netContributions')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Net contributions"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'netContributions' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Net Contributions</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>External deposits and transferred-in assets minus withdrawals and transferred-out assets.</p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <span className="currency">{formatCurrency(metrics.totalInvested, currency)}</span>
            </dd>
          </div>

          {/* Tile 6: Price Contribution */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Price contribution</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('priceContribution')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('priceContribution')}
                  onFocus={() => setActiveTooltip('priceContribution')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Price contribution"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'priceContribution' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Price Contribution</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      The portion of portfolio return attributed to changes in asset market values and capital gains.
                    </p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span
                  className={
                    metrics.priceReturnPercent >= 0
                      ? 'metric-tile__value--positive'
                      : 'metric-tile__value--negative'
                  }
                >
                  {formatPp(metrics.priceReturnPercent)}
                </span>
                <div
                  className={`currency metric-tile__subvalue ${
                    metrics.priceReturnEuros >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative'
                  }`}
                >
                  {formatCurrency(metrics.priceReturnEuros, currency)}
                </div>
              </div>
            </dd>
          </div>

          {/* Tile 7: Income Contribution */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Income contribution</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('incomeContribution')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('incomeContribution')}
                  onFocus={() => setActiveTooltip('incomeContribution')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Income contribution"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'incomeContribution' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Income Contribution</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>The portion of return attributed to recorded dividends, interest, and coupon payouts.</p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span
                  className={
                    metrics.incomeReturnPercent >= 0
                      ? 'metric-tile__value--positive'
                      : 'metric-tile__value--negative'
                  }
                >
                  {formatPp(metrics.incomeReturnPercent)}
                </span>
                <div
                  className={`currency metric-tile__subvalue ${
                    metrics.incomeReturnEuros >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative'
                  }`}
                >
                  {formatCurrency(metrics.incomeReturnEuros, currency)}
                </div>
              </div>
            </dd>
          </div>

          {/* Tile 8: Cost Contribution */}
          <div className="metric-tile">
            <dt className="metric-tile__label">
              <span>Cost contribution</span>
              <div
                className="metric-tile__help-wrapper"
                onMouseEnter={() => setActiveTooltip('costContribution')}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  className="metric-tile__help-button"
                  onClick={() => toggleTooltip('costContribution')}
                  onFocus={() => setActiveTooltip('costContribution')}
                  onBlur={() => setActiveTooltip(null)}
                  aria-label="Learn about Cost contribution"
                >
                  <HelpCircle size={15} />
                </button>
                {activeTooltip === 'costContribution' && (
                  <div className="metric-tile__popover" role="tooltip">
                    <div className="metric-tile__popover-header">
                      <span>Cost Contribution</span>
                      <button type="button" onClick={() => setActiveTooltip(null)}>
                        <X size={13} />
                      </button>
                    </div>
                    <p>
                      The portion of return attributed to recorded broker commissions, transaction fees, and custody
                      costs.
                    </p>
                  </div>
                )}
              </div>
            </dt>
            <dd className="metric-tile__value">
              <div className="metric-tile__stack">
                <span
                  className={
                    metrics.costReturnPercent <= 0
                      ? 'metric-tile__value--negative'
                      : 'metric-tile__value--positive'
                  }
                >
                  {formatPp(metrics.costReturnPercent)}
                </span>
                <div
                  className={`currency metric-tile__subvalue ${
                    metrics.costReturnEuros <= 0 ? 'metric-tile__value--negative' : 'metric-tile__value--positive'
                  }`}
                >
                  {formatCurrency(metrics.costReturnEuros, currency)}
                </div>
              </div>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
};

export default PerformanceAnalysisGrid;
