import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { findSellable, formatUnits, type SellablePosition } from '../lib/saleRules';

interface OwnedHoldingPickerProps {
  positions: readonly SellablePosition[];
  selected: SellablePosition | null;
  onSelect: (position: SellablePosition) => void;
  inputStyle: React.CSSProperties;
}

/** A searchable list of what the person owns. Nothing else can be typed in: you can only sell what you hold. */
export default function OwnedHoldingPicker({ positions, selected, onSelect, inputStyle }: OwnedHoldingPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const matches = findSellable(positions, query);
  const label = (p: SellablePosition) => `${p.symbol} · ${p.name} (Available: ${formatUnits(p.quantity)} units)`;

  const choose = (position: SellablePosition) => {
    onSelect(position);
    setQuery('');
    setOpen(false);
  };

  if (findSellable(positions, '').length === 0) {
    return (
      <p role="status" style={{ ...inputStyle, color: 'var(--text-secondary)', margin: 0 }}>
        No open positions available to sell
      </p>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor={`${listId}-input`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
        <Search size={14} /> What did you sell?
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        type="text"
        placeholder="Search what you own"
        value={open ? query : selected ? label(selected) : query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlighted((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && matches[highlighted]) {
            e.preventDefault();
            choose(matches[highlighted]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        onBlur={() => setOpen(false)}
        style={inputStyle}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            backgroundColor: 'var(--bg-popover)',
            border: '1px solid var(--border-subtle-color)',
            borderRadius: '8px',
            maxHeight: '180px',
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
        >
          {matches.length === 0 && <li style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>You do not own anything that matches.</li>}
          {matches.map((p, index) => (
            <li
              key={p.symbol}
              role="option"
              aria-selected={selected?.symbol === p.symbol}
              // mousedown, not click: the input's blur would close the list before a click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setHighlighted(index)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                backgroundColor: index === highlighted ? 'var(--accent-primary)' : 'transparent',
                color: index === highlighted ? 'var(--text-primary)' : 'inherit',
              }}
            >
              <span style={{ fontWeight: 700 }}>{p.symbol}</span>
              <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>{p.name}</span>
              <span style={{ float: 'right', fontSize: '12px' }}>Available: {formatUnits(p.quantity)} units</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
