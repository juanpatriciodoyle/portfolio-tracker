import { annualisedReturnPercent } from './annualisedReturn';
import { normalizeAssetClass, sectorOf } from './assetClasses';
import type { ColumnKey } from './holdingsColumns';

/** An open position, as `GET /api/portfolio/stats` answers it. */
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

/** A holding that was sold, as `GET /api/portfolio/stats` answers it. */
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

/** One line of the holdings table or one card: every figure ready to show. */
export interface HoldingRow {
  id: string;
  name: string;
  symbol: string;
  assetClass: string;
  sector: string;
  region: string;
  isOpen: boolean;
  units: number;
  heldDays: number;
  paid: number;
  paidPerShare: number;
  value: number;
  pricePerShare: number;
  profit: number;
  profitPercent: number;
  /** Only once a year has passed since the holding began. */
  yearlyReturn: number | null;
  /** Percent of the whole portfolio. */
  share: number;
}

export type SortKey = 'name' | ColumnKey;
export type SortDirection = 'asc' | 'desc';

/** A holding bought today has been held one day. */
const MIN_HELD_DAYS = 1;

interface RowsInput {
  positions: readonly PositionItem[];
  soldAssets: readonly SoldAssetItem[];
  netWorth: number;
  showClosed: boolean;
  isRealInflationMode: boolean;
}

const percentOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

function openRow(position: PositionItem, netWorth: number): HoldingRow {
  const units = position.quantity || 0;
  const paid = position.investedAmount || 0;
  const paidPerShare = position.costPerShare || (units > 0 ? paid / units : 0);
  const value = position.currentValue ?? paid;
  const profit = value - paid;
  const heldDays = Math.max(MIN_HELD_DAYS, position.holdingDays ?? MIN_HELD_DAYS);
  const profitPercent = percentOf(profit, paid);
  return {
    id: `pos-${position.id}`,
    name: position.name || position.symbol,
    symbol: position.symbol,
    assetClass: normalizeAssetClass(position.assetClass),
    sector: sectorOf(position.sector || ''),
    region: position.region || '',
    isOpen: true,
    units,
    heldDays,
    paid,
    paidPerShare,
    value,
    pricePerShare: position.currentPrice || paidPerShare,
    profit,
    profitPercent,
    yearlyReturn: annualisedReturnPercent(profitPercent, heldDays),
    share: percentOf(value, netWorth),
  };
}

function soldRow(sold: SoldAssetItem, isRealInflationMode: boolean): HoldingRow {
  const paid = sold.investedAmount || 0;
  const profit = isRealInflationMode ? sold.realProfitEuros : sold.soldProfit;
  const profitPercent = isRealInflationMode ? percentOf(sold.realProfitEuros, paid) : sold.soldProfitPercent;
  const heldDays = Math.max(MIN_HELD_DAYS, sold.holdingDays ?? MIN_HELD_DAYS);
  return {
    id: `sold-${sold.id}`,
    name: sold.symbol,
    symbol: sold.symbol,
    assetClass: normalizeAssetClass(sold.assetClass),
    sector: sectorOf(sold.sector || ''),
    region: sold.region || '',
    isOpen: false,
    units: 0,
    heldDays,
    paid,
    paidPerShare: 0,
    value: sold.returnedAmount || 0,
    pricePerShare: 0,
    profit,
    profitPercent,
    yearlyReturn: annualisedReturnPercent(profitPercent, heldDays),
    share: 0,
  };
}

/** Everything the table and the cards show, from what the portfolio answers. Open positions first; sold ones only when asked for. */
export function buildHoldingRows(input: RowsInput): HoldingRow[] {
  const open = input.positions.map((position) => openRow(position, input.netWorth));
  const sold = input.showClosed ? input.soldAssets.map((asset) => soldRow(asset, input.isRealInflationMode)) : [];
  return [...open, ...sold];
}

const VALUE_OF: Record<Exclude<SortKey, 'name'>, (row: HoldingRow) => number | null> = {
  value: (row) => row.value,
  profit: (row) => row.profit,
  share: (row) => row.share,
  units: (row) => row.units,
  held: (row) => row.heldDays,
  paid: (row) => row.paid,
  paidPerShare: (row) => row.paidPerShare,
  pricePerShare: (row) => row.pricePerShare,
  yearlyReturn: (row) => row.yearlyReturn,
};

/** A sorted copy. A holding with no figure for the chosen column (no yearly return yet) goes last, whichever way it sorts. */
export function sortHoldingRows(rows: readonly HoldingRow[], key: SortKey, direction: SortDirection): HoldingRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'name') return sign * a.name.localeCompare(b.name);
    const left = VALUE_OF[key](a);
    const right = VALUE_OF[key](b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return sign * (left - right);
  });
}
