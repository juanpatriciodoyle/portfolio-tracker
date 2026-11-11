import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { returnForPeriod, periodPhrase } from '../lib/returnForPeriod';
import {
  type ChartDataPoint,
  type ReportingPeriod,
  type DateRange,
  filterDataByPeriod,
  formatCurrency,
  formatPercent,
} from '../data/sampleChartData';

export type ChartMode = 'value' | 'profit_loss' | 'performance';

interface PortfolioChartProps {
  data: ChartDataPoint[];
  period: ReportingPeriod;
  customRange?: DateRange;
  currency?: string;
  userCashBalance?: number;
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({
  data,
  period,
  customRange,
  currency = 'EUR',
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('value');

  // Dataset visibility toggles
  const [visibleDatasets, setVisibleDatasets] = useState({
    portfolio: true,
    cashflow: true,
    benchmark: true,
  });

  const toggleDataset = (key: 'portfolio' | 'cashflow' | 'benchmark') => {
    setVisibleDatasets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter data according to selected period
  const { filteredData } = useMemo(() => {
    return filterDataByPeriod(data, period, customRange);
  }, [data, period, customRange]);

  // What the header shows: today's value, and what the selected period gained or lost.
  const currentValue = filteredData.length ? filteredData[filteredData.length - 1].portfolio_value_in_reporting_currency : 0;
  const periodChange = useMemo(() => returnForPeriod(data, period, customRange), [data, period, customRange]);
  const isPositive = periodChange.gain >= 0;
  const signedMoney = (amount: number) => `${amount > 0 ? '+' : ''}${formatCurrency(amount, currency)}`;

  // Canvas & Interaction state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{
    point: ChartDataPoint;
    x: number;
    y: number;
    containerWidth: number;
  } | null>(null);

  // Render chart on canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 300; // Fixed visual height

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 16, bottom: 32, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (chartW <= 0 || chartH <= 0) return;

    // Calculate Y range depending on chart mode and active datasets
    const values: number[] = [];
    filteredData.forEach((d) => {
      if (chartMode === 'value') {
        if (visibleDatasets.portfolio) values.push(d.portfolio_value_in_reporting_currency);
        if (visibleDatasets.cashflow) values.push(d.cumulative_cost_in_reporting_currency);
        if (visibleDatasets.benchmark) values.push(d.benchmark_value_in_reporting_currency);
      } else if (chartMode === 'profit_loss') {
        if (visibleDatasets.portfolio) {
          values.push(d.portfolio_value_in_reporting_currency - d.cumulative_cost_in_reporting_currency);
        }
        if (visibleDatasets.benchmark) {
          values.push(d.benchmark_value_in_reporting_currency - d.cumulative_cost_in_reporting_currency);
        }
      } else {
        // Performance (%)
        if (visibleDatasets.portfolio) values.push(d.cumulative_time_weighted_return_rate * 100);
        if (visibleDatasets.benchmark) values.push(d.cumulative_benchmark_time_weighted_return_rate * 100);
      }
    });

    if (!values.length) values.push(0);

    let minY = Math.min(...values);
    let maxY = Math.max(...values);

    if (minY === 0 && maxY === 0) {
      minY = 0;
      maxY = chartMode === 'performance' ? 10 : 1000;
    } else if (minY === maxY) {
      minY = minY > 0 ? minY * 0.9 : minY * 1.1 - 10;
      maxY = maxY > 0 ? maxY * 1.1 : maxY * 0.9 + 10;
    } else {
      // Add 8% breathing room
      const yMargin = (maxY - minY) * 0.08 || 10;
      minY = Math.floor(minY - yMargin);
      maxY = Math.ceil(maxY + yMargin);
    }

    const getY = (val: number) => {
      if (maxY === minY) return padding.top + chartH / 2;
      return padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;
    };

    const getX = (idx: number) => {
      if (filteredData.length <= 1) return padding.left + chartW / 2;
      return padding.left + (idx / (filteredData.length - 1)) * chartW;
    };

    // Draw Grid lines & Y-axis labels
    const gridSteps = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1E1E22';
    ctx.fillStyle = '#71717A';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridSteps; i++) {
      const val = minY + ((maxY - minY) / gridSteps) * i;
      const y = getY(val);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      const label =
        chartMode === 'performance'
          ? `${val.toFixed(1)}%`
          : formatCurrency(val, currency, 0);

      ctx.fillText(label, padding.left - 8, y);
    }

    // Zero-line for profit/loss & performance if applicable
    if (minY < 0 && maxY > 0) {
      const zeroY = getY(0);
      ctx.beginPath();
      ctx.strokeStyle = '#3F3F46';
      ctx.setLineDash([4, 4]);
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(padding.left + chartW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Helper to draw a line path
    const drawLineSeries = (
      getVal: (d: ChartDataPoint) => number,
      color: string,
      gradientColor?: string,
      isDashed = false
    ) => {
      if (!filteredData.length) return;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(isDashed ? [5, 4] : []);
      ctx.lineWidth = isDashed ? 1.5 : 2.5;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (filteredData.length === 1) {
        const y = getY(getVal(filteredData[0]));
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
      } else {
        filteredData.forEach((d, idx) => {
          const x = getX(idx);
          const y = getY(getVal(d));
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      }
      ctx.stroke();

      // Optional gradient area under the main line
      if (gradientColor) {
        ctx.beginPath();
        if (filteredData.length === 1) {
          const y = getY(getVal(filteredData[0]));
          ctx.moveTo(padding.left, y);
          ctx.lineTo(padding.left + chartW, y);
          ctx.lineTo(padding.left + chartW, padding.top + chartH);
          ctx.lineTo(padding.left, padding.top + chartH);
        } else {
          filteredData.forEach((d, idx) => {
            const x = getX(idx);
            const y = getY(getVal(d));
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });

          const lastX = getX(filteredData.length - 1);
          const firstX = getX(0);
          const bottomY = padding.top + chartH;

          ctx.lineTo(lastX, bottomY);
          ctx.lineTo(firstX, bottomY);
        }
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        grad.addColorStop(0, gradientColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.restore();
    };

    // Draw active series based on mode
    if (chartMode === 'value') {
      // 1. Net Contributions (Cashflow)
      if (visibleDatasets.cashflow) {
        drawLineSeries((d) => d.cumulative_cost_in_reporting_currency, '#71717A', undefined, true);
      }
      // 2. Benchmark
      if (visibleDatasets.benchmark) {
        drawLineSeries((d) => d.benchmark_value_in_reporting_currency, '#F59E0B', undefined, false);
      }
      // 3. Portfolio Value
      if (visibleDatasets.portfolio) {
        drawLineSeries(
          (d) => d.portfolio_value_in_reporting_currency,
          '#3B82F6', // Vibrant Electric Blue
          'rgba(59, 130, 246, 0.18)',
          false
        );
      }
    } else if (chartMode === 'profit_loss') {
      // 1. Benchmark Profit/Loss
      if (visibleDatasets.benchmark) {
        drawLineSeries(
          (d) => d.benchmark_value_in_reporting_currency - d.cumulative_cost_in_reporting_currency,
          '#F59E0B',
          undefined,
          true
        );
      }
      // 2. Portfolio Profit/Loss
      if (visibleDatasets.portfolio) {
        drawLineSeries(
          (d) => d.portfolio_value_in_reporting_currency - d.cumulative_cost_in_reporting_currency,
          '#10B981', // Emerald
          'rgba(16, 185, 129, 0.18)',
          false
        );
      }
    } else {
      // Performance mode (%)
      if (visibleDatasets.benchmark) {
        drawLineSeries((d) => d.cumulative_benchmark_time_weighted_return_rate * 100, '#F59E0B', undefined, true);
      }
      if (visibleDatasets.portfolio) {
        drawLineSeries(
          (d) => d.cumulative_time_weighted_return_rate * 100,
          '#10B981',
          'rgba(16, 185, 129, 0.18)',
          false
        );
      }
    }

    // Draw X-axis date ticks
    if (filteredData.length === 1) {
      ctx.fillStyle = '#71717A';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const dObj = new Date(filteredData[0].date_time);
      const dateLabel = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      ctx.fillText(dateLabel, padding.left + chartW / 2, padding.top + chartH + 10);
    } else if (filteredData.length > 1) {
      const xStepCount = Math.min(6, filteredData.length);
      ctx.fillStyle = '#71717A';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let i = 0; i < xStepCount; i++) {
        const idx = Math.floor((i / (xStepCount - 1 || 1)) * (filteredData.length - 1));
        const pt = filteredData[idx];
        const x = getX(idx);
        const dObj = new Date(pt.date_time);

        let dateLabel = dObj.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        if (period === '1D' || period === '1W') {
          dateLabel = dObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
        } else if (period === '1M' || period === 'MTD') {
          dateLabel = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }

        ctx.fillText(dateLabel, x, padding.top + chartH + 10);
      }
    }

    // Draw crosshair if hovering
    if (hoverPoint) {
      const idx = filteredData.findIndex((p) => p.date_time === hoverPoint.point.date_time);
      if (idx >= 0) {
        const hX = getX(idx);

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#A1A1AA';
        ctx.lineWidth = 1;
        ctx.moveTo(hX, padding.top);
        ctx.lineTo(hX, padding.top + chartH);
        ctx.stroke();

        // Draw dot on main line
        let mainVal = hoverPoint.point.portfolio_value_in_reporting_currency;
        if (chartMode === 'profit_loss') {
          mainVal = hoverPoint.point.portfolio_value_in_reporting_currency - hoverPoint.point.cumulative_cost_in_reporting_currency;
        } else if (chartMode === 'performance') {
          mainVal = hoverPoint.point.cumulative_time_weighted_return_rate * 100;
        }

        const dotY = getY(mainVal);
        ctx.beginPath();
        ctx.arc(hX, dotY, 5, 0, Math.PI * 2);
        ctx.fillStyle = chartMode === 'value' ? '#3B82F6' : '#10B981';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        ctx.restore();
      }
    }
  }, [filteredData, chartMode, visibleDatasets, currency, hoverPoint, period]);

  // Redraw when dependencies change or resize occurs
  useEffect(() => {
    drawChart();

    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // Handle pointer tracking for tooltip
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !filteredData.length) return;

    const rect = container.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const padding = { left: 60, right: 16 };
    const chartW = rect.width - padding.left - padding.right;

    const relativeX = Math.max(0, Math.min(clientX - padding.left, chartW));
    const ratio = relativeX / chartW;
    const index = Math.round(ratio * (filteredData.length - 1));
    const point = filteredData[Math.min(index, filteredData.length - 1)];

    setHoverPoint({
      point,
      x: clientX,
      y: clientY,
      containerWidth: rect.width,
    });
  };

  const handlePointerLeave = () => {
    setHoverPoint(null);
  };

  return (
    <section className="portfolio-dashboard-chart-section" id="value" data-dashboard-section="">
      <div className="dashboard-panel-spacious value-overview">
        {/* Top Header Summary */}
        <div className="value-overview__top">
          <div className="value-overview__summary">
            <div className="currency value-overview__amount">
              {formatCurrency(currentValue, currency)}
            </div>

            <div className="value-overview__return value-overview__return--portfolio">
              {isPositive ? (
                <ArrowUpRight size={20} className="lucide lucide-arrow-up-right dashboard-return-icon value-overview__return--positive" aria-hidden="true" />
              ) : (
                <ArrowDownRight size={20} className="lucide lucide-arrow-down-right dashboard-return-icon value-overview__return--negative" aria-hidden="true" />
              )}
              <span className={isPositive ? 'value-overview__return--positive' : 'value-overview__return--negative'}>
                {signedMoney(periodChange.gain)}
                <span className="return-sub-amount"> ({periodChange.percent > 0 ? '+' : ''}{periodChange.percent.toFixed(2)}%)</span>
              </span>
              <span className="value-overview__return-period">{periodPhrase(period)}</span>
            </div>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div className="value-overview__controls">
            <div className="segmented-control" role="group" aria-label="Main chart type">
              <button
                type="button"
                onClick={() => setChartMode('value')}
                className={`segmented-control__item ${chartMode === 'value' ? 'segmented-control__item--active' : ''}`}
                aria-pressed={chartMode === 'value'}
              >
                Value
              </button>
              <button
                type="button"
                onClick={() => setChartMode('profit_loss')}
                className={`segmented-control__item ${chartMode === 'profit_loss' ? 'segmented-control__item--active' : ''}`}
                aria-pressed={chartMode === 'profit_loss'}
              >
                Profit/loss
              </button>
              <button
                type="button"
                onClick={() => setChartMode('performance')}
                className={`segmented-control__item ${chartMode === 'performance' ? 'segmented-control__item--active' : ''}`}
                aria-pressed={chartMode === 'performance'}
              >
                Performance
              </button>
            </div>
          </div>
        </div>

        {/* Chart Canvas & Interactive Tooltip Container */}
        <div
          ref={containerRef}
          className="portfolio-chart-canvas-wrap"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <canvas ref={canvasRef} />

          {/* Floating Hover Tooltip */}
          {hoverPoint && (
            <div
              className="portfolio-chart-tooltip"
              style={{
                left: `${Math.min(
                  Math.max(hoverPoint.x, 140),
                  hoverPoint.containerWidth - 140
                )}px`,
                top: '16px',
              }}
            >
              <div className="portfolio-chart-tooltip__title">
                {new Date(hoverPoint.point.date_time).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>

              <dl className="portfolio-chart-tooltip__list">
                {chartMode === 'value' && (
                  <>
                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-value" />
                        Portfolio value
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatCurrency(hoverPoint.point.portfolio_value_in_reporting_currency, currency)}
                      </dd>
                    </div>

                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-cashflow" />
                        Net contributions
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatCurrency(hoverPoint.point.cumulative_cost_in_reporting_currency, currency)}
                      </dd>
                    </div>

                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                        Benchmark value
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatCurrency(hoverPoint.point.benchmark_value_in_reporting_currency, currency)}
                      </dd>
                    </div>
                  </>
                )}

                {chartMode === 'profit_loss' && (
                  <>
                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-profit-loss" />
                        Cumulative profit/loss
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatCurrency(
                          hoverPoint.point.portfolio_value_in_reporting_currency -
                            hoverPoint.point.cumulative_cost_in_reporting_currency,
                          currency
                        )}
                      </dd>
                    </div>

                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                        Benchmark profit/loss
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatCurrency(
                          hoverPoint.point.benchmark_value_in_reporting_currency -
                            hoverPoint.point.cumulative_cost_in_reporting_currency,
                          currency
                        )}
                      </dd>
                    </div>
                  </>
                )}

                {chartMode === 'performance' && (
                  <>
                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-profit-loss" />
                        Portfolio performance (TWR)
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatPercent(hoverPoint.point.cumulative_time_weighted_return_rate * 100)}
                      </dd>
                    </div>

                    <div className="portfolio-chart-tooltip__row">
                      <dt className="portfolio-chart-tooltip__label">
                        <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                        Benchmark performance
                      </dt>
                      <dd className="portfolio-chart-tooltip__value">
                        {formatPercent(hoverPoint.point.cumulative_benchmark_time_weighted_return_rate * 100)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>

        {/* Legend Controls */}
        <div className="portfolio-chart-legend" aria-label="Chart lines">
          {chartMode === 'value' && (
            <>
              <button
                type="button"
                onClick={() => toggleDataset('portfolio')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.portfolio ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.portfolio}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-value" />
                Portfolio value
              </button>

              <button
                type="button"
                onClick={() => toggleDataset('cashflow')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.cashflow ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                title="External deposits and transferred-in assets minus withdrawals"
                aria-pressed={visibleDatasets.cashflow}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-cashflow" />
                Net contributions
              </button>

              <button
                type="button"
                onClick={() => toggleDataset('benchmark')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.benchmark ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.benchmark}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                Benchmark value (MSCI World)
              </button>
            </>
          )}

          {chartMode === 'profit_loss' && (
            <>
              <button
                type="button"
                onClick={() => toggleDataset('portfolio')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.portfolio ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.portfolio}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-profit-loss" />
                Cumulative profit/loss
              </button>

              <button
                type="button"
                onClick={() => toggleDataset('benchmark')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.benchmark ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.benchmark}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                Benchmark profit/loss
              </button>
            </>
          )}

          {chartMode === 'performance' && (
            <>
              <button
                type="button"
                onClick={() => toggleDataset('portfolio')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.portfolio ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.portfolio}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-profit-loss" />
                Portfolio performance
              </button>

              <button
                type="button"
                onClick={() => toggleDataset('benchmark')}
                className={`portfolio-chart-legend-item ${
                  visibleDatasets.benchmark ? '' : 'portfolio-chart-legend-item--muted'
                }`}
                aria-pressed={visibleDatasets.benchmark}
              >
                <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                Benchmark performance
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default PortfolioChart;
