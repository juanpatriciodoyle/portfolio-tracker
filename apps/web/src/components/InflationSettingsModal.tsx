import { useState } from 'react';
import { Percent, Globe, Check, RefreshCw } from 'lucide-react';

interface InflationSettingsModalProps {
  currentCountry: string;
  currentRate: number;
  onClose: () => void;
  onUpdate: (country: string, rate: number) => void;
}

const COUNTRY_INFLATION_PRESETS: Record<string, number> = {
  'Spain': 2.8,
  'Germany / Eurozone': 2.6,
  'United Kingdom': 2.3,
  'United States': 3.1,
  'Argentina': 250.0,
  'Brazil': 4.2,
  'Japan': 2.8,
};

export default function InflationSettingsModal({
  currentCountry,
  currentRate,
  onClose,
  onUpdate,
}: InflationSettingsModalProps) {
  const [country, setCountry] = useState(currentCountry || 'Spain');
  const [rate, setRate] = useState((currentRate || 2.8).toString());
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleCountrySelect = (selectedCountry: string) => {
    setCountry(selectedCountry);
    if (COUNTRY_INFLATION_PRESETS[selectedCountry] !== undefined) {
      setRate(COUNTRY_INFLATION_PRESETS[selectedCountry].toString());
    }
  };

  const handleAutoSyncSpain = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/user/sync-inflation', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCountry('Spain');
        setRate(data.annualInflationRate.toString());
      }
    } catch (err) {
      console.error('Failed to sync Spain inflation:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const numericRate = parseFloat(rate) || 0;

    try {
      await fetch('/api/user/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          annualInflationRate: numericRate,
        }),
      });

      onUpdate(country, numericRate);
      onClose();
    } catch (err) {
      console.error('Failed to update inflation config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid #27272A',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              color: '#F43F5E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Globe size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Inflation Country
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              Adjust resident country rate to count true real earnings.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#000000', border: '1px solid #27272A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>🇪🇸 Spain Annual CPI Inflation</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Monthly Eurostat / INE sync service</div>
          </div>
          <button
            type="button"
            onClick={handleAutoSyncSpain}
            disabled={isSyncing}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #27272A',
              backgroundColor: '#161618',
              color: '#F4F4F5',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Syncing...' : 'Sync Latest'}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Resident Country
            </label>
            <select
              value={country}
              onChange={(e) => handleCountrySelect(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #27272A',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
            >
              {Object.keys(COUNTRY_INFLATION_PRESETS).map((c) => (
                <option key={c} value={c}>
                  {c} ({COUNTRY_INFLATION_PRESETS[c]}% / year)
                </option>
              ))}
              <option value="Custom">Custom Country</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Annual Inflation Rate (%)
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #27272A',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <Percent size={16} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #27272A',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--accent-primary)',
                color: '#FFFFFF',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Check size={16} /> {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
