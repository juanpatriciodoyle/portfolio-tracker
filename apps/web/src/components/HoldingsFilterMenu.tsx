import { useEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { FILTER_LABELS, countActiveFilters, filterOptions, toggleFilter, type Filterable, type FilterField, type HoldingsFilters, EMPTY_FILTERS } from '../lib/holdingsFilter';

interface HoldingsFilterMenuProps {
  rows: readonly Filterable[];
  filters: HoldingsFilters;
  onChange: (filters: HoldingsFilters) => void;
}

const FIELDS: FilterField[] = ['assetClass', 'sector', 'region'];

/** A funnel button that opens the choices for asset class, sector and region. */
export default function HoldingsFilterMenu({ rows, filters, onChange }: HoldingsFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = countActiveFilters(filters);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="dashboard-table-column-menu" ref={ref}>
      <button
        type="button"
        className="dashboard-icon-button holdings-toolbar__filter"
        onClick={() => setOpen(!open)}
        aria-label="Filter holdings"
        title="Filter holdings"
        aria-expanded={open}
      >
        <Filter size={16} aria-hidden="true" />
        {active > 0 && <span className="holdings-toolbar__badge">{active}</span>}
      </button>

      {open && (
        <div className="dashboard-table-column-menu__menu holdings-filter-menu" role="group" aria-label="Filter holdings">
          {FIELDS.map((field) => {
            const options = filterOptions(rows, field);
            if (options.length === 0) return null;
            return (
              <fieldset key={field} className="holdings-filter-menu__group">
                <legend>{FILTER_LABELS[field]}</legend>
                {options.map((option) => (
                  <label key={option} className="table-column-menu__item">
                    <input type="checkbox" className="table-column-menu__checkbox" checked={filters[field].includes(option)} onChange={() => onChange(toggleFilter(filters, field, option))} />
                    {option}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {active > 0 && (
            <button type="button" className="holdings-filter-menu__clear" onClick={() => onChange(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
