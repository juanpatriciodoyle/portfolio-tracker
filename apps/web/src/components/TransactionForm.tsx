import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { DollarSign, ArrowUpRight, ArrowDownLeft, PlusCircle, MinusCircle, Calendar, Search } from 'lucide-react';
import { authorizedFetch } from '../lib/authorizedFetch';
import OwnedHoldingPicker from './OwnedHoldingPicker';
import { checkSaleQuantity, formatUnits, type SellablePosition } from '../lib/saleRules';

interface TransactionFormProps {
  onSuccess?: () => void;
  /** What the person holds today: the only things that can be sold. */
  positions?: SellablePosition[];
}

interface SearchItem {
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
}

export default function TransactionForm({ onSuccess, positions = [] }: TransactionFormProps) {
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
  const [sellingHolding, setSellingHolding] = useState<SellablePosition | null>(null);
  const isSale = type === 'SOLD';
  const saleCheck = isSale && sellingHolding ? checkSaleQuantity(quantity, sellingHolding.quantity) : null;
  const cannotConfirm = isSale && (!sellingHolding || !saleCheck?.ok);

  const chooseTransactionType = (next: typeof type) => {
    setType(next);
    // A sale starts from what is owned; a purchase from a search. Nothing carries over between them.
    setSymbol('');
    setName('');
    setIsCompleted(false);
    setSellingHolding(null);
    setQuantity(next === 'SOLD' ? '' : '1');
  };

  const selectHolding = (holding: SellablePosition) => {
    setSellingHolding(holding);
    setSymbol(holding.symbol);
    setName(holding.name);
    setAssetClass(holding.assetClass);
    setSector(holding.sector);
    setRegion(holding.region);
    setQuantity('');
  };

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

    const isCashOp = type === 'DEPOSIT' || type === 'WITHDRAWAL';
    if (isSale && cannotConfirm) return;
    if (!isCashOp && (!symbol || !amount)) {
      setStatus({ type: 'error', message: 'Please enter Instrument Symbol and Amount.' });
      return;
    }

    if (isCashOp && !amount) {
      setStatus({ type: 'error', message: 'Please enter the cash amount.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authorizedFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          symbol: isCashOp ? 'CASH' : symbol.toUpperCase(),
          name: name || (isCashOp ? 'Cash Operation' : symbol.toUpperCase()),
          quantity: isCashOp ? 1.0 : parseFloat(quantity || '1'),
          amount: parseFloat(amount),
          fee: parseFloat(fee || '0'),
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          assetClass: isCashOp ? 'Cash' : assetClass,
          sector: isCashOp ? 'Financials' : sector,
          region: isCashOp ? 'Global' : region,
          currency: 'EUR',
        }),
      });

      const data = await response.json().catch(() => ({}) as { error?: string });

      if (response.ok) {
        setStatus({
          type: 'success',
          message: `Recorded transaction successfully!`,
        });
        setSymbol('');
        setName('');
        setQuantity(isSale ? '' : '1');
        setSellingHolding(null);
        setAmount('');
        setFee('0');
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setStatus({ type: 'error', message: data.error || 'The transaction was not recorded. Check the details and try again.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Could not reach the server, so the transaction was not recorded. Check your connection and try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCashOp = type === 'DEPOSIT' || type === 'WITHDRAWAL';

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          letterSpacing: '-0.5px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            color: 'var(--accent-primary)',
          }}
        >
          <DollarSign size={20} />
        </div>
        Log Transaction
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Transaction Type Selector */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-card-color)',
            padding: '4px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => chooseTransactionType('BOUGHT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              backgroundColor: type === 'BOUGHT' ? 'var(--color-profit)' : 'transparent',
              color: type === 'BOUGHT' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <ArrowUpRight size={14} /> Bought
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('SOLD')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              backgroundColor: type === 'SOLD' ? 'var(--color-loss)' : 'transparent',
              color: type === 'SOLD' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <ArrowDownLeft size={14} /> Sold
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('DEPOSIT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              backgroundColor: type === 'DEPOSIT' ? 'var(--color-deposit)' : 'transparent',
              color: type === 'DEPOSIT' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <PlusCircle size={14} /> Deposit
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('WITHDRAWAL')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              backgroundColor: type === 'WITHDRAWAL' ? 'var(--color-warning)' : 'transparent',
              color: type === 'WITHDRAWAL' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <MinusCircle size={14} /> Withdraw
          </button>
        </div>

        {/* Dynamic Fields */}
        {!isCashOp ? (
          <>
            {isSale ? (
              <OwnedHoldingPicker positions={positions} selected={sellingHolding} onSelect={selectHolding} inputStyle={inputStyle} />
            ) : (
              <>
            <div style={{ position: 'relative' }} ref={searchContainerRef}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Search size={14} /> Instrument Ticker / Symbol (Type 3+ letters)</span>
                {isSearching && <span style={{ fontSize: '11px', color: 'var(--text-accent)' }}>Searching live market...</span>}
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
                    backgroundColor: 'var(--bg-popover)',
                    border: '1px solid var(--border-subtle-color)',
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
                        borderBottom: '1px solid var(--border-subtle-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        backgroundColor: idx === highlightedIndex ? 'var(--accent-primary)' : 'transparent',
                        color: idx === highlightedIndex ? 'var(--text-primary)' : 'inherit',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{item.symbol}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-profit)', backgroundColor: 'var(--color-profit-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                        {item.assetClass}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

              </>
            )}

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
                  aria-invalid={saleCheck ? !saleCheck.ok && quantity !== '' : undefined}
                  style={inputStyle}
                />
                {isSale && sellingHolding && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>Available: {formatUnits(sellingHolding.quantity)} units</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(formatUnits(sellingHolding.quantity))}
                      style={{ border: '1px solid var(--border-subtle-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-accent)', fontWeight: 700, fontSize: '11px', padding: '2px 8px', cursor: 'pointer' }}
                    >
                      MAX
                    </button>
                  </div>
                )}
                {saleCheck && !saleCheck.ok && quantity !== '' && (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--color-loss)' }}>
                    {saleCheck.message}
                  </p>
                )}
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
                <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} disabled={isSale} aria-readonly={isSale} style={inputStyle}>
                  {isSale && !['Stock', 'ETF', 'Crypto', 'Bond', 'Real Estate'].includes(assetClass) && <option value={assetClass}>{assetClass}</option>}
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
                <select value={sector} onChange={(e) => setSector(e.target.value)} disabled={isSale} aria-readonly={isSale} style={inputStyle}>
                  {isSale && !['Technology', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Consumer', 'Crypto'].includes(sector) && <option value={sector}>{sector}</option>}
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
              <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={isSale} aria-readonly={isSale} style={inputStyle}>
                  {isSale && !['Spain', 'Europe', 'North America', 'Asia-Pacific', 'LatAm', 'Global'].includes(region) && <option value={region}>{region}</option>}
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
              backgroundColor: status.type === 'success' ? 'var(--color-profit-bg)' : 'var(--color-loss-bg)',
              color: status.type === 'success' ? 'var(--color-profit)' : 'var(--color-loss)',
              border: status.type === 'success' ? '1px solid var(--color-profit-glow)' : '1px solid var(--color-loss-glow)',
            }}
          >
            {status.message}
          </div>
        )}

        {/* Primary Blue Confirm Button */}
        <button
          type="submit"
          disabled={isSubmitting || cannotConfirm}
          style={{
            marginTop: '8px',
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-primary)',
            fontWeight: 700,
            fontSize: '14px',
            cursor: isSubmitting || cannotConfirm ? 'not-allowed' : 'pointer',
            opacity: isSubmitting || cannotConfirm ? 0.5 : 1,
            boxShadow: '0 4px 14px var(--accent-blue-glow)',
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
  border: '1px solid var(--border-card-color)',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};