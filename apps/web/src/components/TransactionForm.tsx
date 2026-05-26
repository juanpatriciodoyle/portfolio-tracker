import { useState } from 'react';
import type { FormEvent } from 'react';
import { DollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface TransactionFormProps {
  onSuccess?: () => void;
}

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [instrumentType, setInstrumentType] = useState('ETF');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [cashAmount, setCashAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!ticker || !name || !instrumentType || !cashAmount) {
      setStatus({ type: 'error', message: 'Please fill out all fields.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          name: name || ticker.toUpperCase(),
          instrumentType,
          type,
          cashAmount: parseFloat(cashAmount),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({
          type: 'success',
          message: `Recorded ${type} order for ${ticker.toUpperCase()} successfully!`,
        });
        setTicker('');
        setName('');
        setCashAmount('');
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to submit transaction.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Could not connect to the API server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '24px',
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
            backgroundColor: 'rgba(0, 102, 255, 0.1)',
            color: 'var(--accent-primary)',
          }}
        >
          <DollarSign size={20} />
        </div>
        Record Transaction
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            display: 'flex',
            borderRadius: '8px',
            backgroundColor: '#121214',
            border: '1px solid #1F1F23',
            padding: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setType('BUY')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              backgroundColor: type === 'BUY' ? 'var(--color-success)' : 'transparent',
              color: type === 'BUY' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              boxShadow: type === 'BUY' ? '0 0 12px rgba(16, 185, 129, 0.3)' : 'none',
            }}
          >
            <ArrowUpRight size={16} /> Bought
          </button>
          <button
            type="button"
            onClick={() => setType('SELL')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              backgroundColor: type === 'SELL' ? 'var(--color-danger)' : 'transparent',
              color: type === 'SELL' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              boxShadow: type === 'SELL' ? '0 0 12px rgba(239, 68, 68, 0.3)' : 'none',
            }}
          >
            <ArrowDownLeft size={16} /> Sold
          </button>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-secondary)',
            }}
          >
            Instrument Ticker
          </label>
          <input
            type="text"
            placeholder="e.g. VUAA.DE"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1F1F23',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.target.style.borderColor = '#1F1F23')}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-secondary)',
            }}
          >
            Instrument Name
          </label>
          <input
            type="text"
            placeholder="e.g. S&P 500 UCITS"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1F1F23',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.target.style.borderColor = '#1F1F23')}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-secondary)',
            }}
          >
            Asset Class
          </label>
          <select
            value={instrumentType}
            onChange={(e) => setInstrumentType(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1F1F23',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238E8E93\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              backgroundSize: '16px',
            }}
          >
            <option value="ETF">ETF</option>
            <option value="Stock">Stock</option>
            <option value="Cash">Cash / Money Market</option>
          </select>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-secondary)',
            }}
          >
            Amount Invested (EUR)
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={cashAmount}
            onChange={(e) => setCashAmount(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid #1F1F23',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.target.style.borderColor = '#1F1F23')}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-primary)',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            marginTop: '12px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(0, 102, 255, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1A75FF';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 102, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 102, 255, 0.3)';
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save Transaction'}
        </button>

        {status && (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px',
              textAlign: 'center',
              fontWeight: 500,
              marginTop: '8px',
              border: status.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
              backgroundColor: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: status.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
}