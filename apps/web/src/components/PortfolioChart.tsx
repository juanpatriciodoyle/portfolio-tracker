import { intlLocale } from '../i18n/locale';
import React, { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { axisLabels } from '../lib/chartAxis';
import type { LineSpan } from '../lib/tooltipPlacement';
import { chartSummary } from '../lib/chartSummary';
import { CHART_FONT, chartThemeFromDocument } from '../lib/chartTheme';
import { scaleX, scaleY, valueDomain } from '../lib/chartScale';
import ChartTooltip from './ChartTooltip';
import HelpTip from './HelpTip';
import Switch from './Switch';
import { displayLocale } from '../lib/money';
import { easeOutExpo } from '../lib/easing';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';
import {
  type ChartDataPoint,
  type ReportingPeriod,
  type DateRange,
  filterDataByPeriod,
  formatCurrency,
} from '../data/sampleChartData';

export type ChartMode = 'value' | 'profit';

interface PortfolioChartProps {
  /** Real readings of the portfolio, oldest first. */
  data: ChartDataPoint[];
  period: ReportingPeriod;
  customRange?: DateRange;
  currency?: string;
  /** The period picker: it sits in the chart's header row, because it decides what the chart shows. */
  periodBar?: ReactNode;
  /** The dates the selected period covers, in words. */
  periodNote?: string;
}

/** What each line is at one reading. `null` means the line has no value there (no index price that day). */
const portfolioAt = (mode: ChartMode) => (point: ChartDataPoint) =>
  mode === 'value' ? point.portfolio_value_in_reporting_currency : point.portfolio_value_in_reporting_currency - point.cumulative_cost_in_reporting_currency;

const worldIndexAt = (mode: ChartMode) => (point: ChartDataPoint) => {
  const value = point.benchmark_value_in_reporting_currency;
  if (value === null) return null;
  return mode === 'value' ? value : value - point.cumulative_cost_in_reporting_currency;
};

const PADDING = { top: 20, right: 16, bottom: 34, left: 72 };
const CHART_HEIGHT = 300;
/** A phone has room for about three dates under the line; wider screens for six. */
const NARROW_CHART_WIDTH = 480;

/**
 * The value over time: your portfolio and, beside it, what the same money would be worth in a world index fund.
 * Made of real daily readings only. Until there are two of them there is no line to draw, and the chart says so.
 */
export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data, period, customRange, currency = 'EUR', periodBar, periodNote }) => {
  const { t, locale } = useTranslation();
  const dateLocale = intlLocale(locale);
  const [chartMode, setChartMode] = useState<ChartMode>('value');
  // The canvas cannot read CSS variables itself: the colours come from the same tokens as everything else.
  const [theme] = useState(chartThemeFromDocument);

  const { filteredData } = useMemo(() => filterDataByPeriod(data, period, customRange), [data, period, customRange]);
  const hasWorldIndex = useMemo(() => filteredData.some((point) => point.benchmark_value_in_reporting_currency !== null), [filteredData]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** How much of the series is drawn, 0 to 1: the line writes itself in from the left. */
  const revealRef = useRef(1);
  const [hoverPoint, setHoverPoint] = useState<{ point: ChartDataPoint; index: number; containerRect: DOMRect } | null>(null);

  /** The vertical axis for what is on screen: shared by the drawing and by the tooltip, which clears the lines. */
  const domain = useMemo(() => {
    const values: number[] = [];
    for (const point of filteredData) {
      values.push(portfolioAt(chartMode)(point));
      const index = worldIndexAt(chartMode)(point);
      if (index !== null) values.push(index);
    }
    return valueDomain(values);
  }, [filteredData, chartMode]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.getBoundingClientRect().width;
    const height = CHART_HEIGHT;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const chartW = width - PADDING.left - PADDING.right;
    const chartH = height - PADDING.top - PADDING.bottom;
    if (chartW <= 0 || chartH <= 0) return;

    const portfolio = portfolioAt(chartMode);
    const worldIndex = worldIndexAt(chartMode);

    const { min: minY, max: maxY } = domain;
    const getY = (val: number) => scaleY(val, domain, PADDING.top, chartH);
    const getX = (idx: number) => scaleX(idx, filteredData.length, PADDING.left, chartW);

    // Grid lines and the money scale
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.axisText;
    ctx.font = CHART_FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const val = minY + ((maxY - minY) / gridSteps) * i;
      const y = getY(val);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartW, y);
      ctx.stroke();
      ctx.fillText(formatCurrency(val, currency, 0), PADDING.left - 8, y);
    }

    if (minY < 0 && maxY > 0) {
      const zeroY = getY(0);
      ctx.beginPath();
      ctx.strokeStyle = theme.zeroLine;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(PADDING.left, zeroY);
      ctx.lineTo(PADDING.left + chartW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /** One line over the readings; a reading without a value breaks it rather than being guessed. */
    const drawLineSeries = (getVal: (d: ChartDataPoint) => number | null, color: string, gradientColor?: string, isDashed = false) => {
      if (!filteredData.length) return;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(isDashed ? [5, 4] : []);
      ctx.lineWidth = isDashed ? 1.5 : 2.5;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (filteredData.length === 1) {
        const value = getVal(filteredData[0]);
        if (value !== null) {
          ctx.moveTo(PADDING.left, getY(value));
          ctx.lineTo(PADDING.left + chartW, getY(value));
        }
      } else {
        let drawing = false;
        filteredData.forEach((d, idx) => {
          const value = getVal(d);
          if (value === null) {
            drawing = false;
            return;
          }
          if (drawing) ctx.lineTo(getX(idx), getY(value));
          else ctx.moveTo(getX(idx), getY(value));
          drawing = true;
        });
      }
      ctx.stroke();

      // The soft area under the main line
      if (gradientColor && filteredData.length > 1) {
        ctx.beginPath();
        filteredData.forEach((d, idx) => {
          const value = getVal(d);
          if (value === null) return;
          if (idx === 0) ctx.moveTo(getX(idx), getY(value));
          else ctx.lineTo(getX(idx), getY(value));
        });
        ctx.lineTo(getX(filteredData.length - 1), PADDING.top + chartH);
        ctx.lineTo(getX(0), PADDING.top + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + chartH);
        grad.addColorStop(0, gradientColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.restore();
    };

    // The lines, uncovered from the left while the chart reveals itself
    ctx.save();
    if (revealRef.current < 1) {
      ctx.beginPath();
      ctx.rect(PADDING.left - 4, 0, chartW * revealRef.current + 8, height);
      ctx.clip();
    }
    if (hasWorldIndex) drawLineSeries(worldIndex, theme.benchmarkLine, undefined, true);
    if (chartMode === 'value') drawLineSeries(portfolio, theme.portfolioLine, theme.portfolioArea, false);
    else drawLineSeries(portfolio, theme.profitLine, theme.profitArea, false);
    ctx.restore();

    // The time axis: none when everything happened on one day
    ctx.fillStyle = theme.axisText;
    ctx.font = CHART_FONT;
    ctx.textBaseline = 'top';
    const labels = axisLabels(filteredData, dateLocale, width < NARROW_CHART_WIDTH ? 3 : 6);
    labels.forEach(({ index, label }, position) => {
      ctx.textAlign = position === 0 ? 'left' : position === labels.length - 1 ? 'right' : 'center';
      ctx.fillText(label, getX(index), PADDING.top + chartH + 10);
    });

    // The crosshair and its dot
    if (hoverPoint) {
      const idx = filteredData.findIndex((p) => p.date_time === hoverPoint.point.date_time);
      if (idx >= 0) {
        const hX = getX(idx);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = theme.crosshair;
        ctx.lineWidth = 1;
        ctx.moveTo(hX, PADDING.top);
        ctx.lineTo(hX, PADDING.top + chartH);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hX, getY(portfolio(hoverPoint.point)), 5, 0, Math.PI * 2);
        ctx.fillStyle = chartMode === 'value' ? theme.portfolioLine : theme.profitLine;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.markerRing;
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [filteredData, chartMode, hasWorldIndex, currency, hoverPoint, theme, dateLocale, domain]);

  useEffect(() => {
    drawChart();
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // The chart writes itself in when its data arrives and when the period or the view changes.
  const drawRef = useRef(drawChart);
  useEffect(() => {
    drawRef.current = drawChart;
  }, [drawChart]);

  const hasSeries = filteredData.length > 1;
  useEffect(() => {
    if (!hasSeries || prefersReducedMotion()) {
      revealRef.current = 1;
      return;
    }
    const startedAt = performance.now();
    const duration = 1100;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      revealRef.current = easeOutExpo(progress);
      drawRef.current();
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    revealRef.current = 0;
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      revealRef.current = 1;
    };
  }, [hasSeries, period, customRange, chartMode]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !filteredData.length) return;

    const rect = container.getBoundingClientRect();
    const chartW = rect.width - PADDING.left - PADDING.right;
    if (chartW <= 0) return;
    const ratio = Math.max(0, Math.min(e.clientX - rect.left - PADDING.left, chartW)) / chartW;
    const index = Math.min(Math.round(ratio * (filteredData.length - 1)), filteredData.length - 1);

    setHoverPoint({ point: filteredData[index], index, containerRect: rect });
  };

  /** Where the lines run between two screen x positions: the tooltip stays clear of all of them. */
  const lineSpanBetween = (fromX: number, toX: number): LineSpan | null => {
    if (!hoverPoint) return null;
    const { containerRect: rect } = hoverPoint;
    const chartW = rect.width - PADDING.left - PADDING.right;
    const chartH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const portfolio = portfolioAt(chartMode);
    const worldIndex = worldIndexAt(chartMode);
    let top = Infinity;
    let bottom = -Infinity;
    filteredData.forEach((point, index) => {
      const x = rect.left + scaleX(index, filteredData.length, PADDING.left, chartW);
      if (x < fromX || x > toX) return;
      for (const value of [portfolio(point), worldIndex(point)]) {
        if (value === null) continue;
        const y = rect.top + scaleY(value, domain, PADDING.top, chartH);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    });
    return top === Infinity ? null : { top, bottom };
  };

  // Fewer than two real readings: there is nothing to draw yet, and inventing a line would be worse than saying so.
  if (data.length < 2) {
    return (
      <section className="portfolio-dashboard-chart-section" id="value" data-dashboard-section="">
        <div className="dashboard-panel-spacious value-overview">
          <h2 className="dashboard-panel-title">{t('chart.title')}</h2>
          <div className="portfolio-chart-pending" role="status">
            <p className="portfolio-chart-pending__title">{t('chart.startsToday.title')}</p>
            <p className="portfolio-chart-pending__note">{t('chart.startsToday.note')}</p>
          </div>
        </div>
      </section>
    );
  }

  // The picture in one sentence, for whoever cannot see it.
  const summary = chartSummary({
    points: filteredData,
    mode: chartMode,
    formatMoney: (amount) => formatCurrency(amount, currency),
    formatDay: (iso) => new Date(iso).toLocaleDateString(displayLocale(), { month: 'short', day: 'numeric', year: 'numeric' }),
    t,
  });
  const portfolioLabel = chartMode === 'value' ? t('chart.portfolioValue') : t('chart.yourProfit');
  const worldIndexLabel = chartMode === 'value' ? t('chart.worldIndex') : t('chart.worldIndexProfit');

  return (
    <section className="portfolio-dashboard-chart-section" id="value" data-dashboard-section="">
      <div className="dashboard-panel-spacious value-overview">
        <div className="value-overview__top">
          <h2 className="dashboard-panel-title">{chartMode === 'value' ? t('chart.title') : t('chart.title.profit')}</h2>
          {periodBar && <div className="value-overview__periods">{periodBar}</div>}
          <div className="value-overview__controls">
            <Switch checked={chartMode === 'profit'} onChange={() => setChartMode((mode) => (mode === 'value' ? 'profit' : 'value'))} label={t('chart.showProfit')} />
          </div>
        </div>
        {periodNote && <p className="value-overview__window">{periodNote}</p>}

        <div ref={containerRef} className="portfolio-chart-canvas-wrap" onPointerMove={handlePointerMove} onPointerLeave={() => setHoverPoint(null)}>
          <canvas ref={canvasRef} role="img" aria-label={summary ?? undefined} />
        </div>

        {hoverPoint && (
          <ChartTooltip
            anchorX={hoverPoint.containerRect.left + scaleX(hoverPoint.index, filteredData.length, PADDING.left, hoverPoint.containerRect.width - PADDING.left - PADDING.right)}
            plot={{ top: hoverPoint.containerRect.top + PADDING.top, bottom: hoverPoint.containerRect.top + CHART_HEIGHT - PADDING.bottom }}
            lineSpan={lineSpanBetween}
          >
            <div className="portfolio-chart-tooltip__title">
              {new Date(hoverPoint.point.date_time).toLocaleDateString(displayLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>

            <dl className="portfolio-chart-tooltip__list">
              <div className="portfolio-chart-tooltip__row">
                <dt className="portfolio-chart-tooltip__label">
                  <span className={`portfolio-chart-legend-swatch ${chartMode === 'value' ? 'portfolio-chart-legend-swatch-value' : 'portfolio-chart-legend-swatch-profit-loss'}`} />
                  {portfolioLabel}
                </dt>
                <dd className="portfolio-chart-tooltip__value">{formatCurrency(portfolioAt(chartMode)(hoverPoint.point), currency)}</dd>
              </div>

              {worldIndexAt(chartMode)(hoverPoint.point) !== null && (
                <div className="portfolio-chart-tooltip__row">
                  <dt className="portfolio-chart-tooltip__label">
                    <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
                    {worldIndexLabel}
                  </dt>
                  <dd className="portfolio-chart-tooltip__value">{formatCurrency(worldIndexAt(chartMode)(hoverPoint.point) as number, currency)}</dd>
                </div>
              )}
            </dl>
          </ChartTooltip>
        )}

        {/* What the lines are, in words: nothing to switch on or off */}
        <ul className="portfolio-chart-legend" aria-label={t('chart.lines')}>
          <li className="portfolio-chart-legend-item">
            <span className={`portfolio-chart-legend-swatch ${chartMode === 'value' ? 'portfolio-chart-legend-swatch-value' : 'portfolio-chart-legend-swatch-profit-loss'}`} />
            {portfolioLabel}
          </li>
          {hasWorldIndex && (
            <li className="portfolio-chart-legend-item">
              <span className="portfolio-chart-legend-swatch portfolio-chart-legend-swatch-benchmark" />
              {worldIndexLabel}
              <HelpTip term={worldIndexLabel} text={t('help.benchmark')} />
            </li>
          )}
        </ul>
      </div>
    </section>
  );
};

export default PortfolioChart;
