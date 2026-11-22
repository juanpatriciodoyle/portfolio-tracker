import { catalogs, type MessageKey } from './catalogs';
import type { Translate } from './translate';

/** The stored words that name a kind of thing: they stay in English in the data and are shown in the language of the screen. */
export type DataKind = 'assetClass' | 'sector' | 'region' | 'country';

/** "Stock" as "Acción"; a value the catalog does not know (a sector from a market search) is shown as it came. */
export function dataLabel(t: Translate, kind: DataKind, value: string): string {
  const key = `data.${kind}.${value}`;
  return key in catalogs.en ? t(key as MessageKey) : value;
}
