import { useState } from 'react';
import { Percent, Globe, Check, RefreshCw } from 'lucide-react';
import { authorizedFetch } from '../lib/authorizedFetch';
import { useSubmitOnce } from '../hooks/useSubmitOnce';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import { formatUpTo } from '../lib/money';

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
  const { t } = useTranslation();
  const [country, setCountry] = useState(currentCountry || 'Spain');
  const [rate, setRate] = useState((currentRate || 2.8).toString());
  const { run: runSave, pending: isSaving } = useSubmitOnce();
  const { run: runSync, pending: isSyncing } = useSubmitOnce();

  const handleCountrySelect = (selectedCountry: string) => {
    setCountry(selectedCountry);
    if (COUNTRY_INFLATION_PRESETS[selectedCountry] !== undefined) {
      setRate(COUNTRY_INFLATION_PRESETS[selectedCountry].toString());
    }
  };

  const handleAutoSyncSpain = () =>
    runSync(async () => {
      try {
        const res = await authorizedFetch('/api/user/sync-inflation', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setCountry('Spain');
          setRate(data.annualInflationRate.toString());
        }
      } catch (err) {
        console.error('Failed to sync Spain inflation:', err);
      }
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericRate = parseFloat(rate) || 0;

    await runSave(async () => {
      try {
        await authorizedFetch('/api/user/config', {
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
      }
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-modal-overlay)',
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
          border: '1px solid var(--border-subtle-color)',
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
              backgroundColor: 'var(--color-loss-bg)',
              color: 'var(--color-loss)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Globe size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('inflation.title')}
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t('inflation.subtitle')}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border-subtle-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('inflation.spainTitle')}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{t('inflation.spainSource')}</div>
          </div>
          <button
            type="button"
            onClick={handleAutoSyncSpain}
            disabled={isSyncing}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle-color)',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-heading)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? t('inflation.syncing') : t('inflation.sync')}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              {t('inflation.country')}
            </label>
            <select
              value={country}
              onChange={(e) => handleCountrySelect(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle-color)',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
            >
              {Object.keys(COUNTRY_INFLATION_PRESETS).map((c) => (
                <option key={c} value={c}>
                  {t('inflation.countryOption', { country: dataLabel(t, 'country', c), rate: formatUpTo(COUNTRY_INFLATION_PRESETS[c], 1) })}
                </option>
              ))}
              <option value="Custom">{t('inflation.customCountry')}</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              {t('inflation.rate')}
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
                  border: '1px solid var(--border-subtle-color)',
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
                border: '1px solid var(--border-subtle-color)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              aria-busy={isSaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Check size={16} /> {isSaving ? t('inflation.saving') : t('inflation.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
