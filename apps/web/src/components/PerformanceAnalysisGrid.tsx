import React, { useState, useMemo } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { formatCurrency } from '../data/sampleChartData';

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
  isRealInflationMode?: boolean;
}

export const PerformanceAnalysisGrid: React.FC<PerformanceAnalysisGridProps> = ({
  stats,
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

    // 6. Cost contribution
    const costReturnEuros = totalFees > 0 ? -totalFees : 0;
    const costReturnPercent = totalInvested > 0 ? (costReturnEuros / totalInvested) * 100 : 0;

    return {
      returnPercent,
      returnEuros,
      costReturnEuros,
      costReturnPercent,
    };
  }, [stats, isRealInflationMode]);

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
