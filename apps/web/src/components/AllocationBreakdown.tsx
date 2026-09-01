import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../data/sampleChartData';
import { type PositionItem } from './HoldingsTable';

export interface BreakdownItem {
  name: string;
  amount: number;
  percentage: number;
}

interface AllocationBreakdownProps {
  breakdowns: {
    sectors: BreakdownItem[];
    regions: BreakdownItem[];
    assetClasses: BreakdownItem[];
  };
  positions: PositionItem[];
  cashBalance?: number;
  netWorth: number;
  currency?: string;
}

type TabType = 'sectors' | 'regions' | 'assetClasses' | 'holdings';

const COLOR_PALETTE = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F43F5E', // Rose
  '#84CC16', // Lime
  '#64748B', // Slate
];

export const AllocationBreakdown: React.FC<AllocationBreakdownProps> = ({
  breakdowns,
  positions,
  cashBalance = 0,
  netWorth,
  currency = 'EUR',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('sectors');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Compute active items based on activeTab
  const activeItems: (BreakdownItem & { color: string })[] = useMemo(() => {
    let items: BreakdownItem[] = [];

    if (activeTab === 'holdings') {
      const list: BreakdownItem[] = positions.map((p) => ({
        name: p.name || p.symbol,
        amount: p.investedAmount || 0,
        percentage: netWorth > 0 ? Math.round(((p.investedAmount || 0) / netWorth) * 1000) / 10 : 0,
      }));

      if (cashBalance > 0) {
        list.push({
          name: 'Cash',
          amount: cashBalance,
          percentage: netWorth > 0 ? Math.round((cashBalance / netWorth) * 1000) / 10 : 0,
        });
      }

      list.sort((a, b) => b.amount - a.amount);
      items = list;
    } else {
      items = (breakdowns[activeTab] || []).slice().sort((a, b) => b.amount - a.amount);
    }

    return items.map((item, idx) => ({
      ...item,
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
    }));
  }, [activeTab, breakdowns, positions, cashBalance, netWorth]);

  // Donut Arc Geometry Helper
  const donutArcs = useMemo(() => {
    const total = activeItems.reduce((acc, it) => acc + it.amount, 0);
    if (total <= 0) return [];

    let currentAngle = -Math.PI / 2; // Start from 12 o'clock
    const cx = 140;
    const cy = 140;

    return activeItems.map((item, idx) => {
      const sliceAngle = (item.amount / total) * (Math.PI * 2);
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const isHovered = hoveredIndex === idx;
      const outerRadius = isHovered ? 124 : 118;
      const innerRadius = isHovered ? 82 : 86;

      // Handle full circle
      if (sliceAngle >= Math.PI * 2 - 0.001) {
        return {
          ...item,
          path: `M ${cx} ${cy - outerRadius} A ${outerRadius} ${outerRadius} 0 1 1 ${cx - 0.01} ${cy - outerRadius} M ${cx} ${cy - innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${cx - 0.01} ${cy - innerRadius} Z`,
        };
      }

      const x1 = cx + outerRadius * Math.cos(startAngle);
      const y1 = cy + outerRadius * Math.sin(startAngle);
      const x2 = cx + outerRadius * Math.cos(endAngle);
      const y2 = cy + outerRadius * Math.sin(endAngle);

      const x3 = cx + innerRadius * Math.cos(endAngle);
      const y3 = cy + innerRadius * Math.sin(endAngle);
      const x4 = cx + innerRadius * Math.cos(startAngle);
      const y4 = cy + innerRadius * Math.sin(startAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      const path = `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;

      return {
        ...item,
        path,
      };
    });
  }, [activeItems, hoveredIndex]);

  const tabLabels: Record<TabType, string> = {
    sectors: 'Sectors',
    regions: 'Regions',
    assetClasses: 'Asset classes',
    holdings: 'Holdings',
  };

  const activeHoveredItem = hoveredIndex !== null && activeItems[hoveredIndex] ? activeItems[hoveredIndex] : null;

  return (
    <section
      className="portfolio-dashboard__section dashboard-section dashboard-section--flush"
      id="allocation-breakdown"
      data-dashboard-section=""
    >
      <div className="dashboard-allocation-panel">
        {/* Header with Title and Tabs */}
        <div className="dashboard-allocation__header">
          <h2 className="dashboard-panel-title">Allocation</h2>

          <nav className="segmented-control" role="tablist" aria-label="Allocation views">
            {(['sectors', 'regions', 'assetClasses', 'holdings'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={`segmented-control__item ${activeTab === tab ? 'segmented-control__item--active' : ''}`}
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                  setHoveredIndex(null);
                }}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </nav>
        </div>

        {/* 2-Column Grid Layout */}
        <div className="dashboard-allocation__content">
          {/* Left Column: Donut Chart with Center Text */}
          <div className="dashboard-allocation__chart-col">
            <div className="dashboard-allocation__donut-wrap">
              <svg width="280" height="280" viewBox="0 0 280 280" className="dashboard-allocation__donut-svg">
                {donutArcs.length === 0 ? (
                  <circle cx="140" cy="140" r="100" fill="none" stroke="#1E1E24" strokeWidth="32" />
                ) : (
                  donutArcs.map((arc, i) => (
                    <path
                      key={arc.name}
                      d={arc.path}
                      fill={arc.color}
                      className="dashboard-allocation__donut-slice"
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.45,
                      }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  ))
                )}
              </svg>

              {/* Center Text Overlay */}
              <div className="dashboard-allocation__center-overlay">
                <div className="dashboard-allocation__center-label">
                  {activeHoveredItem ? activeHoveredItem.name : tabLabels[activeTab]}
                </div>
                <div className="dashboard-allocation__center-amount">
                  {activeHoveredItem
                    ? formatCurrency(activeHoveredItem.amount, currency)
                    : formatCurrency(netWorth, currency)}
                </div>
                {activeHoveredItem && (
                  <div className="dashboard-allocation__center-pct">
                    {activeHoveredItem.percentage.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Legend Matrix */}
          <div className="dashboard-allocation__legend-col">
            {activeItems.length === 0 ? (
              <div className="dashboard-allocation__empty">
                No allocation data recorded yet. Click <strong>Log Transaction</strong> above to add positions.
              </div>
            ) : (
              <div className="dashboard-allocation__legend-list">
                {activeItems.map((item, idx) => {
                  const isHovered = hoveredIndex === idx;
                  return (
                    <div
                      key={item.name}
                      className={`dashboard-allocation__legend-item ${isHovered ? 'is-active' : ''}`}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <div className="dashboard-allocation__legend-top">
                        <div className="dashboard-allocation__legend-title-row">
                          <span
                            className="dashboard-allocation__legend-dot"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="dashboard-allocation__legend-name">{item.name}</span>
                        </div>
                        <div className="dashboard-allocation__legend-values">
                          <span className="dashboard-allocation__legend-amount">
                            {formatCurrency(item.amount, currency)}
                          </span>
                          <span className="dashboard-allocation__legend-pct">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="dashboard-allocation__progress-bg">
                        <div
                          className="dashboard-allocation__progress-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AllocationBreakdown;
