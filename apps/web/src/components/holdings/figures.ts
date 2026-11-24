import { formatCurrency } from '../../data/sampleChartData';
import type { Translate } from '../../i18n/translate';
import { formatHeld } from '../../lib/heldDuration';
import type { ColumnKey } from '../../lib/holdingsColumns';
import type { HoldingRow } from '../../lib/holdingsRows';
import { formatFixed, formatUpTo } from '../../lib/money';

export interface Figure {
  /** What the cell says; empty when there is nothing to say (a yearly return before a year). */
  text: string;
  /** A second, quieter line under it. */
  sub?: string;
  /** Colours it as a gain or a loss. */
  tone?: 'profit' | 'loss';
}

/** Shown where a figure cannot exist: the units of a holding that was sold. */
const NOT_APPLICABLE = '—';

const signed = (amount: number, text: string) => (amount > 0 ? `+${text}` : text);
const percent = (value: number) => signed(value, `${formatFixed(value, 2)}%`);

/** The figure a column shows for a holding. One place, so the table and the cards always say the same thing. */
export function holdingFigure(column: ColumnKey, row: HoldingRow, currency: string, t: Translate): Figure {
  const holdsUnits = row.isOpen && row.units > 0;
  switch (column) {
    case 'value':
      return { text: formatCurrency(row.value, currency) };
    case 'profit':
      return { text: signed(row.profit, formatCurrency(row.profit, currency)), sub: percent(row.profitPercent), tone: row.profit >= 0 ? 'profit' : 'loss' };
    case 'share':
      return { text: row.isOpen ? `${formatFixed(row.share, 1)}%` : NOT_APPLICABLE };
    case 'units':
      return { text: holdsUnits ? formatUpTo(row.units, row.units >= 1 ? 2 : 6) : NOT_APPLICABLE };
    case 'held':
      return { text: formatHeld(row.heldDays, t) };
    case 'paid':
      return { text: formatCurrency(row.paid, currency) };
    case 'paidPerShare':
      return { text: holdsUnits ? formatCurrency(row.paidPerShare, currency) : NOT_APPLICABLE };
    case 'pricePerShare':
      return { text: holdsUnits ? formatCurrency(row.pricePerShare, currency) : NOT_APPLICABLE };
    case 'yearlyReturn':
      return row.yearlyReturn === null ? { text: '' } : { text: percent(row.yearlyReturn), tone: row.yearlyReturn >= 0 ? 'profit' : 'loss' };
  }
}
