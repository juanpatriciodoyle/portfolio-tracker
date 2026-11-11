import { describe, it, expect } from 'vitest';
import { EMPTY_FILTERS, filterOptions, matchesHoldingsFilters, toggleFilter, countActiveFilters } from '../holdingsFilter';

const rows = [
  { assetClass: 'Equity', sector: 'Technology', region: 'North America' },
  { assetClass: 'ETF', sector: 'Diversified', region: 'Global' },
  { assetClass: 'Equity', sector: 'Financials', region: 'Europe' },
  { assetClass: 'Equity', sector: '', region: 'Europe' },
];

describe('filterOptions', () => {
  it('lists each value once, sorted, leaving out blanks', () => {
    expect(filterOptions(rows, 'assetClass')).toEqual(['Equity', 'ETF']);
    expect(filterOptions(rows, 'sector')).toEqual(['Diversified', 'Financials', 'Technology']);
    expect(filterOptions(rows, 'region')).toEqual(['Europe', 'Global', 'North America']);
  });

  it('is empty for no holdings', () => {
    expect(filterOptions([], 'region')).toEqual([]);
  });
});

describe('matchesHoldingsFilters', () => {
  it('lets everything through when nothing is chosen', () => {
    expect(rows.every((row) => matchesHoldingsFilters(row, EMPTY_FILTERS))).toBe(true);
  });

  it('keeps a row that matches any chosen value of a group', () => {
    const filters = { ...EMPTY_FILTERS, region: ['Europe', 'Global'] };
    expect(rows.filter((row) => matchesHoldingsFilters(row, filters))).toHaveLength(3);
  });

  it('requires a row to match every group that has a choice', () => {
    const filters = { assetClass: ['Equity'], sector: [], region: ['Europe'] };
    expect(rows.filter((row) => matchesHoldingsFilters(row, filters))).toHaveLength(2);
  });
});

describe('toggleFilter', () => {
  it('adds a value that was off and removes one that was on, without changing the original', () => {
    const on = toggleFilter(EMPTY_FILTERS, 'sector', 'Technology');
    expect(on.sector).toEqual(['Technology']);
    expect(EMPTY_FILTERS.sector).toEqual([]);
    expect(toggleFilter(on, 'sector', 'Technology').sector).toEqual([]);
  });
});

describe('countActiveFilters', () => {
  it('counts the chosen values across groups', () => {
    expect(countActiveFilters({ assetClass: ['ETF'], sector: ['A', 'B'], region: [] })).toBe(3);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });
});
