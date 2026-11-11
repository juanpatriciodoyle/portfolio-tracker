export type FilterField = 'assetClass' | 'sector' | 'region';

export interface Filterable {
  assetClass: string;
  sector: string;
  region: string;
}

/** The values chosen in each group. An empty group lets everything through. */
export type HoldingsFilters = Readonly<Record<FilterField, readonly string[]>>;

export const EMPTY_FILTERS: HoldingsFilters = { assetClass: [], sector: [], region: [] };

export const FILTER_LABELS: Record<FilterField, string> = { assetClass: 'Asset class', sector: 'Sector', region: 'Region' };

/** What can be chosen in a group: the values the holdings actually have, once each. */
export function filterOptions(rows: readonly Filterable[], field: FilterField): string[] {
  return [...new Set(rows.map((row) => row[field]).filter((value) => value !== ''))].sort((a, b) => a.localeCompare(b));
}

export function matchesHoldingsFilters(row: Filterable, filters: HoldingsFilters): boolean {
  return (Object.keys(filters) as FilterField[]).every((field) => filters[field].length === 0 || filters[field].includes(row[field]));
}

export function toggleFilter(filters: HoldingsFilters, field: FilterField, value: string): HoldingsFilters {
  const chosen = filters[field];
  return { ...filters, [field]: chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value] };
}

export const countActiveFilters = (filters: HoldingsFilters): number => (Object.keys(filters) as FilterField[]).reduce((sum, field) => sum + filters[field].length, 0);
