import React, { useState } from 'react';
import { DollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function TransactionForm() {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState('');
    const [instrumentType, setInstrumentType] = useState('ETF');
    const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
    const [cashAmount, setCashAmount] = useState('');
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);

        if (!ticker || !cashAmount) {
            setStatus({ type: 'error', message: 'Please fill out Ticker and Amount.' });
            return;
        }

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
                setStatus({ type: 'success', message: `Recorded ${type} order for ${ticker.toUpperCase()} successfully!` });
                setTicker('');
                setName('');
                setCashAmount('');
            } else {
                setStatus({ type: 'error', message: data.error || 'Failed to submit transaction.' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Could not connect to the API server.' });
        }
    };

    return (
        <div style={{ maxWidth: '450px', margin: '40px auto', padding: '24px', fontFamily: 'system-ui, sans-serif', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DollarSign size={24} color="#2563eb" /> Record Transaction
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Buy / Sell Toggle Switches */}
                <div style={{ display: 'flex', borderRadius: '8px', backgroundColor: '#f1f5f9', padding: '4px' }}>
                    <button
                        type="button"
                        onClick={() => setType('BUY')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, backgroundColor: type === 'BUY' ? '#22c55e' : 'transparent', color: type === 'BUY' ? 'white' : '#64748b', transition: 'all 0.2s' }}
                    >
                        <ArrowUpRight size={16} /> Bought
                    </button>
                    <button
                        type="button"
                        onClick={() => setType('SELL')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, backgroundColor: type === 'SELL' ? '#ef4444' : 'transparent', color: type === 'SELL' ? 'white' : '#64748b', transition: 'all 0.2s' }}
                    >
                        <ArrowDownLeft size={16} /> Sold
                    </button>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#334155' }}>Instrument Ticker</label>
                    <input type="text" placeholder="e.g. VUAA.DE" value={ticker} onChange={(e) => setTicker(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#334155' }}>Instrument Name (Optional)</label>
                    <input type="text" placeholder="e.g. S&P 500 UCITS" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#334155' }}>Asset Class</label>
                    <select value={instrumentType} onChange={(e) => setInstrumentType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white' }}>
                        <option value="ETF">ETF</option>
                        <option value="Stock">Stock</option>
                        <option value="Cash">Cash / Money Market</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#334155' }}>Amount Invested (EUR)</label>
                    <input type="number" placeholder="0.00" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', backgroundColor: '#1e293b', color: 'white', fontWeight: 600, cursor: 'pointer', marginTop: '8px' }}>
                    Save Transaction
                </button>

                {status && (
                    <div style={{ padding: '12px', borderRadius: '6px', fontSize: '14px', textAlign: 'center', fontWeight: 500, backgroundColor: status.type === 'success' ? '#dcfce7' : '#fee2e2', color: status.type === 'success' ? '#15803d' : '#b91c1c' }}>
                        {status.message}
                    </div>
                )}
            </form>
        </div>
    );
}