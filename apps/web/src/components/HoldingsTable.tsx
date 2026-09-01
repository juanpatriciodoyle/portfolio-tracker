import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Columns3, HelpCircle, X, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../data/sampleChartData';

export interface PositionItem {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  region: string;
  sector: string;
  quantity: number;
  investedAmount: number;
  costPerShare?: number;
  currentPrice?: number;
  currentValue?: number;
  holdingDays?: number;
  createdAt?: string;
}

export interface SoldAssetItem {
  id: string;
  symbol: string;
  assetClass: string;
  region: string;
  sector: string;
  investedAmount: number;
  returnedAmount: number;
  soldProfit: number;
  soldProfitPercent: number;
  holdingInflationPercent: number;
  realProfitEuros: number;
  holdingDays?: number;
  date: string;
}

interface HoldingsTableProps {
  positions: PositionItem[];
  soldAssets: SoldAssetItem[];
  netWorth: number;
  currency?: string;
  isRealInflationMode?: boolean;
}

type SortKey =
  | 'security_name'
  | 'position'
  | 'holding_period'
  | 'net_cash_invested'
  | 'net_cash_invested_per_share'
  | 'value'
  | 'price_per_share'
  | 'money_weighted_return'
  | 'net_profit_loss'
  | 'allocation';

type SortDirection = 'asc' | 'desc';

interface TableHoldingRow {
  id: string;
  security_name: string;
  symbol: string;
  assetClass: string;
  position: number;
  holding_period: number;
  net_cash_invested: number;
  net_cash_invested_per_share: number;
  value: number;
  price_per_share: number;
  money_weighted_return: number;
  net_profit_loss: number;
  allocation: number;
  isOpen: boolean;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  positions,
  soldAssets,
  netWorth,
  currency = 'EUR',
  isRealInflationMode = false,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('allocation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showClosed, setShowClosed] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const columnMenuRef = useRef<HTMLDivElement | null>(null);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    position: true,
    netCash: true,
    value: true,
    return: true,
  });

  const toggleColumn = (col: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'security_name' ? 'asc' : 'desc');
    }
  };

  // Convert positions and soldAssets into unified holding rows
  const holdingRows = useMemo(() => {
    const rows: TableHoldingRow[] = [];

    // Open positions
    positions.forEach((p) => {
      const quantity = p.quantity || 0;
      const invested = p.investedAmount || 0;
      const costPerShare = p.costPerShare || (quantity > 0 ? invested / quantity : 0);
      const currentPrice = p.currentPrice || costPerShare;
      const val = p.currentValue !== undefined ? p.currentValue : invested;
      const netProfit = val - invested;
      const mwr = invested > 0 ? (netProfit / invested) * 100 : 0;
      const alloc = netWorth > 0 ? (val / netWorth) * 100 : 0;

      rows.push({
        id: `pos-${p.id}`,
        security_name: p.name || p.symbol,
        symbol: p.symbol,
        assetClass: p.assetClass || 'Stock',
        position: quantity,
        holding_period: p.holdingDays || 1,
        net_cash_invested: invested,
        net_cash_invested_per_share: costPerShare,
        value: val,
        price_per_share: currentPrice,
        money_weighted_return: mwr,
        net_profit_loss: netProfit,
        allocation: alloc,
        isOpen: true,
      });
    });

    // Closed / sold positions if enabled
    if (showClosed) {
      soldAssets.forEach((s) => {
        const invested = s.investedAmount || 0;
        const profit = isRealInflationMode ? s.realProfitEuros : s.soldProfit;
        const mwr = isRealInflationMode
          ? invested > 0 ? (s.realProfitEuros / invested) * 100 : 0
          : s.soldProfitPercent;

        rows.push({
          id: `sold-${s.id}`,
          security_name: s.symbol,
          symbol: s.symbol,
          assetClass: s.assetClass || 'Stock',
          position: 0,
          holding_period: s.holdingDays || 1,
          net_cash_invested: invested,
          net_cash_invested_per_share: 0,
          value: s.returnedAmount || 0,
          price_per_share: 0,
          money_weighted_return: mwr,
          net_profit_loss: profit,
          allocation: 0,
          isOpen: false,
        });
      });
    }

    // Sort rows
    return rows.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
  }, [positions, soldAssets, netWorth, showClosed, sortKey, sortDirection, isRealInflationMode]);

  // Logo fallback badge helper
  const renderSecurityLogo = (name: string, symbol: string, assetClass: string) => {
    let initial = (symbol || name || 'S').charAt(0).toUpperCase();
    let badgeClass = 'security-logo--stock';

    if (assetClass.toLowerCase().includes('crypto') || symbol.includes('BTC') || symbol.includes('ETH')) {
      badgeClass = 'security-logo--crypto';
      if (symbol.includes('BTC')) initial = '₿';
      else if (symbol.includes('ETH')) initial = 'Ξ';
    } else if (assetClass.toLowerCase().includes('etf') || symbol.includes('.DE') || symbol.includes('IE00')) {
      badgeClass = 'security-logo--etf';
    }

    return (
      <div className={`security-logo ${badgeClass}`}>
        <span className="security-logo__text">{initial}</span>
      </div>
    );
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return (
        <span className="sort-icon-neutral">
          <ChevronUp size={10} />
        </span>
      );
    }
    return (
      <span className="sort-icon-active">
        {sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </span>
    );
  };

  return (
    <section className="portfolio-dashboard__section dashboard-section dashboard-section--flush" id="holdings">
      <div className="dashboard-panel">
        {/* Header */}
        <div className="dashboard-panel-header">
          <h2 className="dashboard-panel-title">Holdings</h2>

          <div className="dashboard-table-column-menu" ref={columnMenuRef}>
            <button
              type="button"
              className="dashboard-icon-button"
              onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
              aria-label="Toggle table columns"
              aria-expanded={isColumnMenuOpen}
            >
              <Columns3 size={18} />
            </button>

            {isColumnMenuOpen && (
              <div className="dashboard-table-column-menu__menu">
                <ul>
                  <li className="table-column-menu__item">
                    <input
                      type="checkbox"
                      id="col-pos"
                      checked={visibleColumns.position}
                      onChange={() => toggleColumn('position')}
                      className="table-column-menu__checkbox"
                    />
                    <label htmlFor="col-pos" className="table-column-menu__label">
                      Position
                    </label>
                  </li>
                  <li className="table-column-menu__item">
                    <input
                      type="checkbox"
                      id="col-netcash"
                      checked={visibleColumns.netCash}
                      onChange={() => toggleColumn('netCash')}
                      className="table-column-menu__checkbox"
                    />
                    <label htmlFor="col-netcash" className="table-column-menu__label">
                      Net cash invested
                    </label>
                  </li>
                  <li className="table-column-menu__item">
                    <input
                      type="checkbox"
                      id="col-val"
                      checked={visibleColumns.value}
                      onChange={() => toggleColumn('value')}
                      className="table-column-menu__checkbox"
                    />
                    <label htmlFor="col-val" className="table-column-menu__label">
                      Value
                    </label>
                  </li>
                  <li className="table-column-menu__item">
                    <input
                      type="checkbox"
                      id="col-ret"
                      checked={visibleColumns.return}
                      onChange={() => toggleColumn('return')}
                      className="table-column-menu__checkbox"
                    />
                    <label htmlFor="col-ret" className="table-column-menu__label">
                      Holding return (MWR)
                    </label>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Holdings Table */}
        <div className="dashboard-table-scroll dashboard-table-scroll--holdings">
          <div className="dashboard-table-wrapper dashboard-table-wrapper--holdings">
            <table id="holdings-table" className="dashboard-table dashboard-table--holdings">
              <thead>
                <tr>
                  {/* Column 1: Security */}
                  <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--left">
                    <div
                      className="dashboard-table-sort-header"
                      onClick={() => handleSort('security_name')}
                      role="button"
                      tabIndex={0}
                    >
                      <span>Security</span>
                      {renderSortIndicator('security_name')}
                    </div>
                  </th>

                  {/* Column 2: Position & Holding period */}
                  {visibleColumns.position && (
                    <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right"
                        onClick={() => handleSort('position')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>Position</span>
                        {renderSortIndicator('position')}
                      </div>
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right dashboard-table__subhead"
                        onClick={() => handleSort('holding_period')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>Holding period</span>
                        {renderSortIndicator('holding_period')}
                      </div>
                    </th>
                  )}

                  {/* Column 3: Net Cash Invested */}
                  {visibleColumns.netCash && (
                    <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                      <div className="dashboard-table-heading__label-row">
                        <div
                          className="dashboard-table-sort-header dashboard-table-sort-header--right"
                          onClick={() => handleSort('net_cash_invested')}
                          role="button"
                          tabIndex={0}
                        >
                          <span>Net cash invested</span>
                          {renderSortIndicator('net_cash_invested')}
                        </div>
                        <div
                          className="metric-tile__help-wrapper"
                          onMouseEnter={() => setActiveTooltip('netCash')}
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          <button
                            type="button"
                            className="metric-tile__help-button"
                            onClick={() =>
                              setActiveTooltip(activeTooltip === 'netCash' ? null : 'netCash')
                            }
                            onFocus={() => setActiveTooltip('netCash')}
                            onBlur={() => setActiveTooltip(null)}
                            aria-label="Learn about Net cash invested"
                          >
                            <HelpCircle size={14} />
                          </button>
                          {activeTooltip === 'netCash' && (
                            <div className="metric-tile__popover metric-tile__popover--table" role="tooltip">
                              <div className="metric-tile__popover-header">
                                <span>Net Cash Invested</span>
                                <button type="button" onClick={() => setActiveTooltip(null)}>
                                  <X size={12} />
                                </button>
                              </div>
                              <p>
                                Purchases and other cash invested in the holding minus sales proceeds and other cash
                                returned, shown in base currency.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right dashboard-table__subhead"
                        onClick={() => handleSort('net_cash_invested_per_share')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>per share</span>
                        {renderSortIndicator('net_cash_invested_per_share')}
                      </div>
                    </th>
                  )}

                  {/* Column 4: Value */}
                  {visibleColumns.value && (
                    <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right"
                        onClick={() => handleSort('value')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>Value</span>
                        {renderSortIndicator('value')}
                      </div>
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right dashboard-table__subhead"
                        onClick={() => handleSort('price_per_share')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>per share</span>
                        {renderSortIndicator('price_per_share')}
                      </div>
                    </th>
                  )}

                  {/* Column 5: Holding Return (MWR) & Net profit/loss */}
                  {visibleColumns.return && (
                    <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                      <div className="dashboard-table-heading__label-row">
                        <div
                          className="dashboard-table-sort-header dashboard-table-sort-header--right"
                          onClick={() => handleSort('money_weighted_return')}
                          role="button"
                          tabIndex={0}
                        >
                          <span>Holding return (MWR)</span>
                          {renderSortIndicator('money_weighted_return')}
                        </div>
                        <div
                          className="metric-tile__help-wrapper"
                          onMouseEnter={() => setActiveTooltip('mwr')}
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          <button
                            type="button"
                            className="metric-tile__help-button"
                            onClick={() =>
                              setActiveTooltip(activeTooltip === 'mwr' ? null : 'mwr')
                            }
                            onFocus={() => setActiveTooltip('mwr')}
                            onBlur={() => setActiveTooltip(null)}
                            aria-label="Learn about Holding return (MWR)"
                          >
                            <HelpCircle size={14} />
                          </button>
                          {activeTooltip === 'mwr' && (
                            <div className="metric-tile__popover metric-tile__popover--table" role="tooltip">
                              <div className="metric-tile__popover-header">
                                <span>Holding Return (MWR)</span>
                                <button type="button" onClick={() => setActiveTooltip(null)}>
                                  <X size={12} />
                                </button>
                              </div>
                              <p>
                                The return on the capital invested in this holding, accounting for the size and timing of
                                its recorded transactions via XIRR.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        className="dashboard-table-sort-header dashboard-table-sort-header--right dashboard-table__subhead"
                        onClick={() => handleSort('net_profit_loss')}
                        role="button"
                        tabIndex={0}
                      >
                        <span>Net profit/loss</span>
                        {renderSortIndicator('net_profit_loss')}
                      </div>
                    </th>
                  )}

                  {/* Column 6: Allocation % */}
                  <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                    <div
                      className="dashboard-table-sort-header dashboard-table-sort-header--right"
                      onClick={() => handleSort('allocation')}
                      role="button"
                      tabIndex={0}
                    >
                      <span>Allocation %</span>
                      {renderSortIndicator('allocation')}
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="dashboard-table__body">
                {holdingRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="dashboard-table__cell dashboard-table__cell--empty"
                      style={{ textAlign: 'center', padding: '36px 16px', color: '#71717A' }}
                    >
                      No holdings in portfolio yet. Click <strong>Log Transaction</strong> above to record your first
                      position.
                    </td>
                  </tr>
                ) : (
                  holdingRows.map((row) => {
                    const isPositive = row.net_profit_loss >= 0;
                    return (
                      <tr key={row.id} className={row.isOpen ? 'table-row--active' : 'table-row--closed'}>
                        {/* 1. Security */}
                        <td className="dashboard-table__cell dashboard-table__cell--asset">
                          <div className="dashboard-table__inline-start">
                            {renderSecurityLogo(row.security_name, row.symbol, row.assetClass)}
                            <div className="dashboard-table-asset__body">
                              <div className="dashboard-table-asset__name">
                                {row.security_name}
                                {!row.isOpen && <span className="holding-badge-closed">Closed</span>}
                              </div>
                              <div className="dashboard-table-asset__meta">{row.symbol}</div>
                              <div className="dashboard-table-bar" aria-hidden="true">
                                <span
                                  className="dashboard-table-bar__fill"
                                  style={{ width: `${Math.min(100, Math.max(0, row.allocation))}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Position & Holding period */}
                        {visibleColumns.position && (
                          <td className="dashboard-table__cell dashboard-table__cell--numeric dashboard-table__cell--muted">
                            <div className="dashboard-table__value">
                              {row.isOpen
                                ? row.position >= 1
                                  ? row.position.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                  : row.position.toLocaleString(undefined, { maximumFractionDigits: 6 })
                                : '0 (Closed)'}
                            </div>
                            <div className="dashboard-table__subvalue">{row.holding_period} days</div>
                          </td>
                        )}

                        {/* 3. Net cash invested */}
                        {visibleColumns.netCash && (
                          <td className="dashboard-table__cell dashboard-table__cell--numeric">
                            <div className="currency dashboard-table__value">
                              {formatCurrency(row.net_cash_invested, currency)}
                            </div>
                            <div className="dashboard-table__subvalue">
                              <span className="currency">
                                {row.isOpen && row.position > 0
                                  ? `${formatCurrency(row.net_cash_invested_per_share, currency)}/share`
                                  : '—'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 4. Value */}
                        {visibleColumns.value && (
                          <td className="dashboard-table__cell dashboard-table__cell--numeric">
                            <div className="currency dashboard-table__value">
                              {formatCurrency(row.value, currency)}
                            </div>
                            <div className="dashboard-table__subvalue">
                              <span className="currency">
                                {row.isOpen && row.position > 0
                                  ? `${formatCurrency(row.price_per_share, currency)}/share`
                                  : '—'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 5. Holding Return (MWR) & Net profit/loss */}
                        {visibleColumns.return && (
                          <td className="dashboard-table__cell dashboard-table__cell--numeric">
                            <div
                              className={`dashboard-table__value dashboard-table__value--medium ${
                                isPositive ? 'dashboard-table__cell--positive' : 'dashboard-table__cell--negative'
                              }`}
                            >
                              {row.money_weighted_return >= 0 ? '+' : ''}
                              {row.money_weighted_return.toFixed(2)}%/year
                            </div>
                            <div className="dashboard-table__subvalue">
                              <span
                                className={`currency ${
                                  isPositive ? 'dashboard-table__cell--positive' : 'dashboard-table__cell--negative'
                                }`}
                              >
                                {row.net_profit_loss >= 0 ? '+' : ''}
                                {formatCurrency(row.net_profit_loss, currency)}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 6. Allocation % */}
                        <td className="dashboard-table__cell dashboard-table__cell--numeric dashboard-table__cell--muted">
                          {row.allocation.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <nav className="dashboard-section-footer" aria-label="Holdings table actions">
          <div className="dashboard-section-footer__meta" />
          <div className="dashboard-section-footer__actions">
            <button
              type="button"
              className="dashboard-flat-button"
              onClick={() => setShowClosed(!showClosed)}
            >
              {showClosed ? 'Show open positions only' : 'See both open and closed positions'}
            </button>
          </div>
        </nav>
      </div>
    </section>
  );
};

export default HoldingsTable;
