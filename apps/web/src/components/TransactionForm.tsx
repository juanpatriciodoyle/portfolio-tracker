import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, ArrowDownLeft, PlusCircle, MinusCircle, Calendar } from 'lucide-react';

interface TransactionFormProps {
  onSuccess?: () => void;
}

interface SearchItem {
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
}

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const [type, setType] = useState<'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL'>('BOUGHT');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('0');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [assetClass, setAssetClass] = useState('Stock');
  const [sector, setSector] = useState('Technology');
  const [region, setRegion] = useState('Europe');

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Trigger market autocomplete search when user types 3+ characters
  useEffect(() => {
    if (isCompleted || symbol.trim().length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(symbol)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0 && !isCompleted);
          setHighlightedIndex(data.length > 0 ? 0 : -1);
        }
      } catch (err) {
        console.error('Failed to search market tickers:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [symbol, isCompleted]);

  const handleSelectSearchResult = (item: SearchItem) => {
    setSymbol(item.symbol);
    setName(item.name);
    if (item.assetClass) setAssetClass(item.assetClass);
    if (item.sector) setSector(item.sector);
    setIsCompleted(true);
    setShowDropdown(false);
    setSearchResults([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        e.preventDefault();
        handleSelectSearchResult(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type,
          symbol: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 'CASH' : symbol.toUpperCase(),
          name: name || undefined,
          quantity: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 1 : parseFloat(quantity),
          amount: parseFloat(amount),
          fee: parseFloat(fee) || 0,
          date: new Date(date).toISOString(),
          assetClass: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 'Cash' : assetClass,
          sector: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 'Financials' : sector,
          region,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to log transaction');
      }

      setStatus({ type: 'success', message: 'Transaction logged successfully!' });
      setSymbol('');
      setName('');
      setQuantity('1');
      setAmount('');
      setFee('0');
      setIsCompleted(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'An error occurred' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 20px 0', letterSpacing: '-0.5px' }}>
        Log Portfolio Transaction
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Transaction Type Tabs */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            Operation Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setType('BOUGHT')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 4px',
                borderRadius: '8px',
                border: type === 'BOUGHT' ? '1px solid #10B981' : '1px solid #1E1E22',
                backgroundColor: type === 'BOUGHT' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-input)',
                color: type === 'BOUGHT' ? '#10B981' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowUpRight size={16} /> Bought
            </button>

            <button
              type="button"
              onClick={() => setType('SOLD')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 4px',
                borderRadius: '8px',
                border: type === 'SOLD' ? '1px solid #F43F5E' : '1px solid #1E1E22',
                backgroundColor: type === 'SOLD' ? 'rgba(244, 63, 94, 0.15)' : 'var(--bg-input)',
                color: type === 'SOLD' ? '#F43F5E' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowDownLeft size={16} /> Sold
            </button>

            <button
              type="button"
              onClick={() => setType('DEPOSIT')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 4px',
                borderRadius: '8px',
                border: type === 'DEPOSIT' ? '1px solid #CA8A04' : '1px solid #1E1E22',
                backgroundColor: type === 'DEPOSIT' ? 'rgba(133, 77, 14, 0.25)' : 'var(--bg-input)',
                color: type === 'DEPOSIT' ? '#EAB308' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <PlusCircle size={16} /> Deposit
            </button>

            <button
              type="button"
              onClick={() => setType('WITHDRAWAL')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 4px',
                borderRadius: '8px',
                border: type === 'WITHDRAWAL' ? '1px solid #F59E0B' : '1px solid #1E1E22',
                backgroundColor: type === 'WITHDRAWAL' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-input)',
                color: type === 'WITHDRAWAL' ? '#F59E0B' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <MinusCircle size={16} /> Withdraw
            </button>
          </div>
        </div>

        {/* Asset Fields (Bought/Sold) */}
        {type === 'BOUGHT' || type === 'SOLD' ? (
          <>
            {/* Ticker Search Field with Autocomplete Dropdown */}
            <div ref={searchContainerRef} style={{ position: 'relative' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                <span>Asset Symbol / Ticker</span>
                {isSearching && <span style={{ fontSize: '11px', color: '#2563EB' }}>Searching live tickers...</span>}
              </label>

              <input
                type="text"
                placeholder="e.g. SAN.MC, AAPL, NVDA, BTC-USD"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setIsCompleted(false);
                }}
                onKeyDown={handleKeyDown}
                required
                style={inputStyle}
              />

              {/* Autocomplete Dropdown List */}
              {showDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: '4px',
                    backgroundColor: '#18181B',
                    border: '1px solid #27272A',
                    borderRadius: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  }}
                >
                  {searchResults.map((item, idx) => (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelectSearchResult(item)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #27272A',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        backgroundColor: idx === highlightedIndex ? '#2563EB' : 'transparent',
                        color: idx === highlightedIndex ? '#FFFFFF' : 'inherit',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: '#F4F4F5' }}>{item.symbol}</span>
                        <span style={{ color: '#A1A1AA', marginLeft: '8px', fontSize: '12px' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#10B981', backgroundColor: '#064E3B', padding: '2px 6px', borderRadius: '4px' }}>
                        {item.assetClass}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity Field (Decimal / Float) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Quantity (Shares / Units)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 10.5 or 0.025"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Total Money {type === 'BOUGHT' ? 'Invested' : 'Received'} (€)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1500.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Asset Class
                </label>
                <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} style={inputStyle}>
                  <option value="Stock">Stock</option>
                  <option value="ETF">ETF</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Bond">Bond</option>
                  <option value="Real Estate">Real Estate</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Sector
                </label>
                <select value={sector} onChange={(e) => setSector(e.target.value)} style={inputStyle}>
                  <option value="Technology">Technology</option>
                  <option value="Financials">Financials</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Energy">Energy</option>
                  <option value="Industrials">Industrials</option>
                  <option value="Consumer">Consumer</option>
                  <option value="Crypto">Crypto</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Region / Geography
              </label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                <option value="Spain">Spain</option>
                <option value="Europe">Europe</option>
                <option value="North America">North America</option>
                <option value="Asia-Pacific">Asia-Pacific</option>
                <option value="LatAm">LatAm</option>
                <option value="Global">Global</option>
              </select>
            </div>
          </>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Cash Amount (€)
            </label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 5000.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        )}

        {/* Date Field Moved Above Broker Fee */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
            <Calendar size={14} /> Transaction Date (Past or Present)
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        {/* Broker Fee Field */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
            Broker Fee (€)
          </label>
          <input
            type="number"
            step="any"
            placeholder="0.00"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            style={inputStyle}
          />
        </div>

        {status && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: status.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: status.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
              border: status.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
            }}
          >
            {status.message}
          </div>
        )}

        {/* Primary Blue Confirm Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            marginTop: '8px',
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-primary)',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '14px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
          }}
        >
          {isSubmitting ? 'Confirming...' : 'Confirm'}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #1E1E22',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};