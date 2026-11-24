import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useHoldingsColumns } from '../hooks/useHoldingsColumns';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTranslation } from '../i18n/useTranslation';
import { NARROW_SCREEN_QUERY } from '../lib/breakpoints';
import { COLUMN_KEYS, type ColumnKey } from '../lib/holdingsColumns';
import { EMPTY_FILTERS, matchesHoldingsFilters, type HoldingsFilters } from '../lib/holdingsFilter';
import { buildHoldingRows, sortHoldingRows, type PositionItem, type SoldAssetItem, type SortDirection, type SortKey } from '../lib/holdingsRows';
import { matchesHoldingsQuery } from '../lib/holdingsSearch';
import HelpTip from './HelpTip';
import HoldingsFilterMenu from './HoldingsFilterMenu';
import { COLUMN_HELP, COLUMN_LABEL } from './holdings/columns';
import { holdingFigure } from './holdings/figures';
import HoldingsCards from './holdings/HoldingsCards';
import HoldingsColumnMenu from './holdings/HoldingsColumnMenu';
import { SecurityLogo } from './holdings/SecurityLogo';

export type { PositionItem, SoldAssetItem };

interface HoldingsTableProps {
  positions: PositionItem[];
  soldAssets: SoldAssetItem[];
  netWorth: number;
  currency?: string;
  isRealInflationMode?: boolean;
}

/** The first click on a column sorts the biggest first; a name starts at A. */
const firstDirection = (key: SortKey): SortDirection => (key === 'name' ? 'asc' : 'desc');

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ positions, soldAssets, netWorth, currency = 'EUR', isRealInflationMode = false }) => {
  const { t } = useTranslation();
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  const { choice, toggle } = useHoldingsColumns();
  const [sortKey, setSortKey] = useState<SortKey>('share');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HoldingsFilters>(EMPTY_FILTERS);

  const sortBy = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(firstDirection(key));
    }
  };

  const allRows = useMemo(
    () => buildHoldingRows({ positions, soldAssets, netWorth, showClosed, isRealInflationMode }),
    [positions, soldAssets, netWorth, showClosed, isRealInflationMode]
  );

  // What the filter can offer: every holding shown in the table, before any filter is applied.
  const rows = useMemo(
    () =>
      sortHoldingRows(
        allRows.filter((row) => matchesHoldingsFilters(row, filters) && matchesHoldingsQuery({ symbol: row.symbol, name: row.name, sector: row.sector }, query)),
        sortKey,
        sortDirection
      ),
    [allRows, filters, query, sortKey, sortDirection]
  );

  const shownColumns = COLUMN_KEYS.filter((key) => choice[key]);

  const heading = (key: SortKey, label: string, help?: string, align: 'left' | 'right' = 'right') => (
    <th
      key={key}
      scope="col"
      className={`dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--${align}`}
      aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div className={`holdings-heading holdings-heading--${align}`}>
        <button type="button" className="holdings-sort" onClick={() => sortBy(key)}>
          <span>{label}</span>
          <span className={`holdings-sort__icon ${sortKey === key ? 'is-active' : ''}`} aria-hidden="true">
            {sortKey === key && sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
        {help && <HelpTip term={label} text={help} />}
      </div>
    </th>
  );

  const empty = (
    <>
      {query.trim() ? (
        t('holdings.noMatch')
      ) : (
        <>
          {t('holdings.emptyBefore')}
          <strong>{t('header.logTransaction')}</strong>
          {t('holdings.emptyAfter')}
        </>
      )}
    </>
  );

  return (
    <section className="portfolio-dashboard__section dashboard-section dashboard-section--flush" id="holdings">
      <div className="dashboard-panel">
        <div className="dashboard-panel-header">
          <h2 className="dashboard-panel-title">{t('holdings.title')}</h2>
        </div>

        {/* One toolbar row: search on the left, filter and columns on the right */}
        <div className="holdings-toolbar">
          <label className="holdings-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              className="holdings-search__input"
              placeholder={t('holdings.searchPlaceholder')}
              aria-label={t('holdings.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="holdings-toolbar__actions">
            <HoldingsFilterMenu rows={allRows} filters={filters} onChange={setFilters} />
            {!isNarrow && <HoldingsColumnMenu choice={choice} onToggle={toggle} />}
          </div>
        </div>

        {isNarrow ? (
          rows.length === 0 ? (
            <p className="holdings-empty">{empty}</p>
          ) : (
            <HoldingsCards rows={rows} currency={currency} />
          )
        ) : (
          <div className="dashboard-table-scroll dashboard-table-scroll--holdings">
            <div className="dashboard-table-wrapper dashboard-table-wrapper--holdings">
              <table id="holdings-table" className="dashboard-table dashboard-table--holdings">
                <thead>
                  <tr>
                    {heading('name', t('holdings.col.name'), undefined, 'left')}
                    {shownColumns.map((key: ColumnKey) => heading(key, t(COLUMN_LABEL[key]), COLUMN_HELP[key] && t(COLUMN_HELP[key]!)))}
                  </tr>
                </thead>

                <tbody className="dashboard-table__body">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + shownColumns.length} className="dashboard-table__cell dashboard-table__cell--empty holdings-empty">
                        {empty}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className={row.isOpen ? 'table-row--active' : 'table-row--closed'}>
                        <td className="dashboard-table__cell dashboard-table__cell--asset">
                          <div className="dashboard-table__inline-start">
                            <SecurityLogo name={row.name} symbol={row.symbol} assetClass={row.assetClass} />
                            <div className="dashboard-table-asset__body">
                              <div className="dashboard-table-asset__name">
                                {row.name}
                                {!row.isOpen && <span className="holding-badge-sold">{t('holdings.sold')}</span>}
                              </div>
                              {row.isOpen && <div className="dashboard-table-asset__meta">{row.symbol}</div>}
                            </div>
                          </div>
                        </td>
                        {shownColumns.map((key) => {
                          const figure = holdingFigure(key, row, currency, t);
                          const tone = figure.tone === 'profit' ? 'dashboard-table__cell--positive' : figure.tone === 'loss' ? 'dashboard-table__cell--negative' : '';
                          return (
                            <td key={key} className="dashboard-table__cell dashboard-table__cell--numeric">
                              <div className={`dashboard-table__value ${tone}`}>{figure.text}</div>
                              {figure.sub && <div className={`dashboard-table__subvalue ${tone}`}>{figure.sub}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <nav className="dashboard-section-footer" aria-label={t('holdings.actions')}>
          <div className="dashboard-section-footer__meta" />
          <div className="dashboard-section-footer__actions">
            <button type="button" className="dashboard-flat-button" onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? t('holdings.showOpenOnly') : t('holdings.showAll')}
            </button>
          </div>
        </nav>
      </div>
    </section>
  );
};

export default HoldingsTable;
