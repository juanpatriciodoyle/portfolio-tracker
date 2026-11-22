import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../data/sampleChartData';
import { intlLocale } from '../i18n/locale';
import { useTranslation } from '../i18n/useTranslation';
import { authorizedFetch } from '../lib/authorizedFetch';
import { formatFixed, monthNames } from '../lib/money';

export interface PerformancePeriodItem {
  period_type: 'year' | 'month' | 'ttm';
  year: number;
  month: number | null; // 1-12 or null
  from_date: string;
  to_date: string;
  absolute_return_amount_in_reporting_currency: number;
  time_weighted_return_rate: number;
}

interface PerformanceBreakdownProps {
  periodsData?: PerformancePeriodItem[];
  currency?: string;
  userId?: string;
}

export const PerformanceBreakdown: React.FC<PerformanceBreakdownProps> = ({
  periodsData: initialPeriodsData,
  currency = 'EUR',
  userId,
}) => {
  const { t, locale } = useTranslation();
  const MONTH_NAMES = useMemo(() => monthNames('short', intlLocale(locale)), [locale]);
  const MONTH_FULL_NAMES = useMemo(() => monthNames('long', intlLocale(locale)), [locale]);
  const [unit, setUnit] = useState<'currency' | 'percent'>('currency');
  const [view, setView] = useState<'bar' | 'heatmap'>('bar');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showAllYears, setShowAllYears] = useState(false);
  const [periods, setPeriods] = useState<PerformancePeriodItem[]>(initialPeriodsData || []);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Fetch periods data if not passed or when userId changes
  useEffect(() => {
    if (initialPeriodsData !== undefined) {
      setPeriods(initialPeriodsData);
      return;
    }

    const fetchPeriods = async () => {
      try {
        const res = await authorizedFetch('/api/portfolio/performance-periods');
        if (res.ok) {
          const data = await res.json();
          setPeriods(data);
        }
      } catch (err) {
        console.error('Failed to fetch performance periods:', err);
      }
    };

    fetchPeriods();
  }, [initialPeriodsData, userId]);

  // Extract distinct years sorted descending
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    periods.forEach((p) => {
      if (p.year) yearsSet.add(p.year);
    });
    if (yearsSet.size === 0) {
      yearsSet.add(new Date().getFullYear());
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [periods]);

  // Format compact currency (e.g. +€19.3K or -€14.3K)
  const formatCompactCurrency = (val: number) => {
    const sign = val > 0 ? '+' : val < 0 ? '-' : '';
    const abs = Math.abs(val);
    const currSymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';

    if (abs >= 1000000) {
      return `${sign}${currSymbol}${formatFixed(abs / 1000000, 1)}M`;
    }
    if (abs >= 1000) {
      return `${sign}${currSymbol}${formatFixed(abs / 1000, 1)}K`;
    }
    if (abs === 0) {
      return `${currSymbol}0`;
    }
    return `${sign}${currSymbol}${formatFixed(abs, 0)}`;
  };

  // Format compact percent (e.g. +6.68% or -4.58%)
  const formatCompactPercent = (rate: number) => {
    const pct = rate * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${formatFixed(pct, 2)}%`;
  };

  // Calculate Heatmap Alpha & Colors based on value
  const getHeatmapColorStyles = (item: PerformancePeriodItem | null) => {
    if (!item) {
      return {
        background: 'var(--bg-input)',
        color: 'var(--text-muted)',
      };
    }

    const val = item.absolute_return_amount_in_reporting_currency;
    const rate = item.time_weighted_return_rate;
    const metric = unit === 'currency' ? val : rate;

    if (Math.abs(metric) < 0.0001) {
      return {
        background: 'var(--border-divider-color)',
        color: 'var(--text-muted)',
      };
    }

    if (metric > 0) {
      const intensity = unit === 'currency' ? Math.min(0.4, 0.1 + (val / 50000) * 0.3) : Math.min(0.4, 0.1 + (rate / 0.15) * 0.3);
      return {
        background: `rgba(16, 185, 129, ${intensity.toFixed(3)})`,
        color: 'var(--color-profit)',
      };
    } else {
      const intensity = unit === 'currency' ? Math.min(0.4, 0.1 + (Math.abs(val) / 50000) * 0.3) : Math.min(0.4, 0.1 + (Math.abs(rate) / 0.15) * 0.3);
      return {
        background: `rgba(244, 63, 94, ${intensity.toFixed(3)})`,
        color: 'var(--color-loss)',
      };
    }
  };

  // Prepare Bar Chart Items based on selectedYear
  const barChartItems = useMemo(() => {
    if (selectedYear === 'all') {
      // Annual bars for each year
      return availableYears
        .slice()
        .reverse()
        .map((y) => {
          const yrItem = periods.find((p) => p.period_type === 'year' && p.year === y);
          return {
            label: `${y}`,
            item: yrItem || {
              period_type: 'year' as const,
              year: y,
              month: null,
              from_date: `${y}-01-01T00:00:00.000Z`,
              to_date: `${y}-12-31T23:59:59.000Z`,
              absolute_return_amount_in_reporting_currency: 0,
              time_weighted_return_rate: 0,
            },
          };
        });
    }

    if (selectedYear === 'ttm') {
      // Last 12 months
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-12
      const ttmMonths: { label: string; item: PerformancePeriodItem }[] = [];

      for (let i = 11; i >= 0; i--) {
        let m = currentMonth - i;
        let y = currentYear;
        if (m <= 0) {
          m += 12;
          y -= 1;
        }

        const found = periods.find((p) => p.period_type === 'month' && p.year === y && p.month === m);
        ttmMonths.push({
          label: `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`,
          item: found || {
            period_type: 'month',
            year: y,
            month: m,
            from_date: `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`,
            to_date: `${y}-${String(m).padStart(2, '0')}-28T23:59:59.000Z`,
            absolute_return_amount_in_reporting_currency: 0,
            time_weighted_return_rate: 0,
          },
        });
      }
      return ttmMonths;
    }

    // Specific Year (e.g. 2026) -> 12 Months
    const targetYr = parseInt(selectedYear, 10);
    return MONTH_NAMES.map((mName, idx) => {
      const monthNum = idx + 1;
      const found = periods.find((p) => p.period_type === 'month' && p.year === targetYr && p.month === monthNum);
      return {
        label: mName,
        item: found || {
          period_type: 'month' as const,
          year: targetYr,
          month: monthNum,
          from_date: `${targetYr}-${String(monthNum).padStart(2, '0')}-01T00:00:00.000Z`,
          to_date: `${targetYr}-${String(monthNum).padStart(2, '0')}-28T23:59:59.000Z`,
          absolute_return_amount_in_reporting_currency: 0,
          time_weighted_return_rate: 0,
        },
      };
    });
  }, [selectedYear, availableYears, periods, MONTH_NAMES]);

  // Determine displayed years in heatmap (collapse to first 3 if showAllYears is false)
  const displayedYears = useMemo(() => {
    if (showAllYears || availableYears.length <= 3) {
      return availableYears;
    }
    return availableYears.slice(0, 3);
  }, [availableYears, showAllYears]);

  return (
    <section
      className="portfolio-dashboard__section dashboard-section dashboard-section--flush"
      id="performance"
      data-dashboard-section=""
    >
      <div className="dashboard-performance">
        {/* Header with Title and Control Toggles */}
        <div className="dashboard-performance__header">
          <h2 className="dashboard-panel-title">{t('perf.title')}</h2>
          <div className="dashboard-performance__controls">
            {/* Unit Toggle: P/L vs % */}
            <div className="segmented-control" aria-label={t('perf.unit')}>
              <button
                type="button"
                className={`segmented-control__item ${unit === 'currency' ? 'segmented-control__item--active' : ''}`}
                onClick={() => setUnit('currency')}
                aria-pressed={unit === 'currency'}
                title={t('perf.profitLossHint')}
              >
                {t('perf.profitLoss')}
              </button>
              <button
                type="button"
                className={`segmented-control__item ${unit === 'percent' ? 'segmented-control__item--active' : ''}`}
                onClick={() => setUnit('percent')}
                aria-pressed={unit === 'percent'}
                title={t('perf.percentHint')}
              >
                %
              </button>
            </div>

            {/* View Toggle: Bar Chart vs Heatmap */}
            <div className="segmented-control" aria-label={t('perf.chartType')}>
              <button
                type="button"
                id="portfolio-performance-bar-button"
                className={`segmented-control__item ${view === 'bar' ? 'segmented-control__item--active' : ''}`}
                onClick={() => setView('bar')}
                aria-pressed={view === 'bar'}
              >
                {t('perf.bar')}
              </button>
              <button
                type="button"
                id="portfolio-performance-heatmap-button"
                className={`segmented-control__item ${view === 'heatmap' ? 'segmented-control__item--active' : ''}`}
                onClick={() => setView('heatmap')}
                aria-pressed={view === 'heatmap'}
              >
                {t('perf.heatmap')}
              </button>
            </div>
          </div>
        </div>

        {/* Period Navigation Rail */}
        <div className="dashboard-pill-rail dashboard-pill-rail--bordered dashboard-pill-rail--section-tabs dashboard-performance__tabs-scroll">
          <nav className="segmented-control segmented-control--subtle dashboard-pill-rail__list dashboard-performance__tabs" aria-label={t('perf.periods')}>
            <button
              type="button"
              className={`segmented-control__item ${selectedYear === 'all' ? 'segmented-control__item--active' : ''}`}
              onClick={() => setSelectedYear('all')}
              aria-pressed={selectedYear === 'all'}
            >
              {t('period.all')}
            </button>
            <button
              type="button"
              className={`segmented-control__item ${selectedYear === 'ttm' ? 'segmented-control__item--active' : ''}`}
              onClick={() => setSelectedYear('ttm')}
              aria-pressed={selectedYear === 'ttm'}
              title={t('perf.ttmHint')}
            >
              {t('perf.ttm')}
            </button>
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                className={`segmented-control__item ${selectedYear === String(yr) ? 'segmented-control__item--active' : ''}`}
                onClick={() => setSelectedYear(String(yr))}
                aria-pressed={selectedYear === String(yr)}
              >
                {yr}
              </button>
            ))}
          </nav>
        </div>

        {/* Performance Body */}
        <div className="dashboard-performance__body">
          {/* VIEW A: Bar Chart */}
          {view === 'bar' && (
            <div className="dashboard-performance__bar-panel">
              <div className="dashboard-performance__chart-wrap" style={{ position: 'relative', width: '100%', height: '360px', padding: '16px 0' }}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 800 320"
                  preserveAspectRatio="none"
                  style={{ overflow: 'visible' }}
                >
                  {/* Background horizontal zero baseline & grid */}
                  <line x1="40" y1="160" x2="780" y2="160" stroke="var(--border-subtle-color)" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="40" y1="50" x2="780" y2="50" stroke="var(--border-divider-color)" strokeWidth="1" />
                  <line x1="40" y1="270" x2="780" y2="270" stroke="var(--border-divider-color)" strokeWidth="1" />

                  {/* Render Bars */}
                  {(() => {
                    const values = barChartItems.map((b) =>
                      unit === 'currency'
                        ? b.item.absolute_return_amount_in_reporting_currency
                        : b.item.time_weighted_return_rate * 100
                    );
                    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
                    const count = barChartItems.length;
                    const availableWidth = 740;
                    const step = availableWidth / count;
                    const barWidth = Math.min(48, Math.max(16, step * 0.6));

                    return barChartItems.map((bar, i) => {
                      const val =
                        unit === 'currency'
                          ? bar.item.absolute_return_amount_in_reporting_currency
                          : bar.item.time_weighted_return_rate * 100;
                      const isPositive = val >= 0;
                      const barHeight = Math.max(3, (Math.abs(val) / maxAbs) * 100);
                      const x = 40 + i * step + (step - barWidth) / 2;
                      const y = isPositive ? 160 - barHeight : 160;
                      const barColor = isPositive ? 'var(--color-profit)' : 'var(--color-loss)';
                      const isHovered = hoveredBarIndex === i;

                      return (
                        <g key={i}>
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx={3}
                            fill={barColor}
                            opacity={isHovered ? 1 : 0.85}
                            style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                            onMouseEnter={() => setHoveredBarIndex(i)}
                            onMouseLeave={() => setHoveredBarIndex(null)}
                          />

                          {/* X-axis label */}
                          <text
                            x={x + barWidth / 2}
                            y="300"
                            textAnchor="middle"
                            fill="var(--text-secondary)"
                            fontSize="11"
                            fontWeight="500"
                          >
                            {bar.label}
                          </text>

                          {/* Value label on bar if active */}
                          <text
                            x={x + barWidth / 2}
                            y={isPositive ? y - 6 : y + barHeight + 12}
                            textAnchor="middle"
                            fill={barColor}
                            fontSize="10.5"
                            fontWeight="600"
                          >
                            {unit === 'currency'
                              ? formatCompactCurrency(bar.item.absolute_return_amount_in_reporting_currency)
                              : formatCompactPercent(bar.item.time_weighted_return_rate)}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>

                {/* Hover Tooltip Card */}
                {hoveredBarIndex !== null && barChartItems[hoveredBarIndex] && (
                  <div
                    className="performance-bar-tooltip"
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '16px',
                      backgroundColor: 'var(--bg-popover)',
                      border: '1px solid var(--border-popover)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {barChartItems[hoveredBarIndex].label}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                      {t('perf.absoluteReturn')}{' '}
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            barChartItems[hoveredBarIndex].item.absolute_return_amount_in_reporting_currency >= 0
                              ? 'var(--color-profit)'
                              : 'var(--color-loss)',
                        }}
                      >
                        {barChartItems[hoveredBarIndex].item.absolute_return_amount_in_reporting_currency >= 0 ? '+' : ''}
                        {formatCurrency(
                          barChartItems[hoveredBarIndex].item.absolute_return_amount_in_reporting_currency,
                          currency
                        )}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', marginTop: '2px' }}>
                      {t('perf.twr')}{' '}
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            barChartItems[hoveredBarIndex].item.time_weighted_return_rate >= 0 ? 'var(--color-profit)' : 'var(--color-loss)',
                        }}
                      >
                        {formatFixed(barChartItems[hoveredBarIndex].item.time_weighted_return_rate * 100, 2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW B: Monthly Heatmap Grid */}
          {view === 'heatmap' && (
            <div className="dashboard-performance__heatmap-panel">
              <div className="dashboard-scroll-affordance dashboard-scroll-affordance--no-scroll">
                <div className="dashboard-performance__heatmap-scroll">
                  <div className="dashboard-performance__heatmap">
                    {/* Header Columns */}
                    <span className="dashboard-performance__heatmap-label" />
                    {MONTH_NAMES.map((m) => (
                      <span key={m} className="dashboard-performance__heatmap-month">
                        {m}
                      </span>
                    ))}

                    {/* Matrix Rows by Year */}
                    {displayedYears.map((yr) => {
                      const now = new Date();
                      return (
                        <React.Fragment key={yr}>
                          {/* Year Row Label */}
                          <span className="dashboard-performance__heatmap-label">{yr}</span>

                          {/* 12 Month Cells */}
                          {MONTH_NAMES.map((mName, mIdx) => {
                            const monthNum = mIdx + 1;
                            const monthFromDate = new Date(Date.UTC(yr, mIdx, 1));
                            const isFuture = monthFromDate.getTime() > now.getTime();

                            if (isFuture) {
                              return (
                                <span
                                  key={`${yr}-${monthNum}`}
                                  className="dashboard-performance__heatmap-cell is-empty"
                                  aria-label={t('perf.noData', { month: mName, year: yr })}
                                />
                              );
                            }

                            const periodItem = periods.find(
                              (p) => p.period_type === 'month' && p.year === yr && p.month === monthNum
                            );

                            const colorStyles = getHeatmapColorStyles(periodItem || null);
                            const valAbs = periodItem?.absolute_return_amount_in_reporting_currency || 0;
                            const twr = periodItem?.time_weighted_return_rate || 0;

                            const titleText = `${MONTH_FULL_NAMES[mIdx]} ${yr}
${t('perf.absoluteReturn')} ${valAbs >= 0 ? '+' : ''}${formatCurrency(valAbs, currency)}
${t('perf.twr')} ${twr >= 0 ? '+' : ''}${formatFixed(twr * 100, 2)}%
${t('perf.cellRange', { month: mName, year: yr, last: new Date(yr, monthNum, 0).getDate() })}`;

                            return (
                              <button
                                key={`${yr}-${monthNum}`}
                                type="button"
                                className="dashboard-performance__heatmap-cell"
                                title={titleText}
                                aria-label={titleText}
                                style={{
                                  backgroundColor: colorStyles.background,
                                  color: colorStyles.color,
                                }}
                              >
                                <span className="dashboard-performance__heatmap-value">
                                  {unit === 'currency'
                                    ? formatCompactCurrency(valAbs)
                                    : formatCompactPercent(twr)}
                                </span>
                              </button>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Show More / Show Less Footer */}
              {availableYears.length > 3 && (
                <div className="dashboard-performance__footer">
                  <button
                    type="button"
                    className="dashboard-performance__show-more"
                    onClick={() => setShowAllYears(!showAllYears)}
                    aria-expanded={showAllYears}
                  >
                    <span>{showAllYears ? t('perf.showLess') : t('perf.showMore')}</span>
                    {showAllYears ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default PerformanceBreakdown;
