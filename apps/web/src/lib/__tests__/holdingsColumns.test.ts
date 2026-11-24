import { describe, it, expect } from 'vitest';
import { COLUMN_KEYS, DEFAULT_COLUMNS, parseStoredColumns, serializeColumns, toggleColumn } from '../holdingsColumns';

describe('holdings columns', () => {
  it('shows four columns by default: name, value, profit and share of the portfolio', () => {
    expect(DEFAULT_COLUMNS).toEqual({ value: true, profit: true, share: true, units: false, held: false, paid: false, paidPerShare: false, pricePerShare: false, yearlyReturn: false });
    expect(Object.keys(DEFAULT_COLUMNS).sort()).toEqual([...COLUMN_KEYS].sort());
  });

  it('starts from the defaults when nothing was saved', () => {
    expect(parseStoredColumns(null)).toEqual(DEFAULT_COLUMNS);
  });

  it('reads what it saved', () => {
    const chosen = { ...DEFAULT_COLUMNS, units: true, share: false };
    expect(parseStoredColumns(serializeColumns(chosen))).toEqual(chosen);
  });

  it('falls back to the defaults for anything it cannot read', () => {
    expect(parseStoredColumns('not json')).toEqual(DEFAULT_COLUMNS);
    expect(parseStoredColumns('[1,2]')).toEqual(DEFAULT_COLUMNS);
    expect(parseStoredColumns('{"value":"yes"}')).toEqual(DEFAULT_COLUMNS);
  });

  it('does not break a table saved by the earlier version (position, netCash, value, return)', () => {
    const earlier = JSON.stringify({ position: false, netCash: true, value: true, return: false });
    expect(parseStoredColumns(earlier)).toEqual(DEFAULT_COLUMNS);
  });

  it('treats anything with the earlier names as the earlier version, whatever it hid', () => {
    expect(parseStoredColumns(JSON.stringify({ position: true, netCash: true, value: false, return: true }))).toEqual(DEFAULT_COLUMNS);
  });

  it('keeps the choices it knows and fills the rest with defaults', () => {
    expect(parseStoredColumns('{"units":true,"colour":true}')).toEqual({ ...DEFAULT_COLUMNS, units: true });
  });

  it('turns one column on or off without touching the others', () => {
    const next = toggleColumn(DEFAULT_COLUMNS, 'units');
    expect(next.units).toBe(true);
    expect(next.value).toBe(true);
    expect(toggleColumn(next, 'units').units).toBe(false);
    expect(DEFAULT_COLUMNS.units).toBe(false);
  });
});
