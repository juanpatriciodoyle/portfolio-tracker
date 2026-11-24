import type { MessageKey } from '../../i18n/catalogs';
import type { ColumnKey } from '../../lib/holdingsColumns';

/** The heading of each column, and the one-sentence explanation of the words that need one. */
export const COLUMN_LABEL: Record<ColumnKey, MessageKey> = {
  value: 'holdings.col.value',
  profit: 'holdings.col.profit',
  share: 'holdings.col.share',
  units: 'holdings.col.units',
  held: 'holdings.col.held',
  paid: 'holdings.col.paid',
  paidPerShare: 'holdings.col.paidPerShare',
  pricePerShare: 'holdings.col.pricePerShare',
  yearlyReturn: 'holdings.col.yearlyReturn',
};

export const COLUMN_HELP: Partial<Record<ColumnKey, MessageKey>> = {
  profit: 'holdings.help.profit',
  paid: 'holdings.help.paid',
  yearlyReturn: 'holdings.help.yearlyReturn',
};
