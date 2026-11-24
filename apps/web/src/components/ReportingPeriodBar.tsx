import React, { useState } from 'react';
import type { ReportingPeriod, DateRange } from '../data/sampleChartData';
import { Calendar, X } from 'lucide-react';
import type { MessageKey } from '../i18n/catalogs';
import { useTranslation } from '../i18n/useTranslation';

interface ReportingPeriodBarProps {
  activePeriod: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod, customRange?: DateRange) => void;
  customRange?: DateRange;
  /** The windows real readings cover (see `lib/periodAvailability.ts`). Nothing else is offered. */
  available: readonly ReportingPeriod[];
  /** The first day with a real reading, "YYYY-MM-DD": a custom range cannot start before it. */
  realFrom?: string | null;
}

const PERIODS: { key: Exclude<ReportingPeriod, 'Custom'>; label: MessageKey; tooltip: MessageKey }[] = [
  { key: 'All', label: 'period.all', tooltip: 'period.tip.all' },
  { key: '1Y', label: 'period.1y', tooltip: 'period.tip.1y' },
  { key: 'YTD', label: 'period.ytd', tooltip: 'period.tip.ytd' },
  { key: '3M', label: 'period.3m', tooltip: 'period.tip.3m' },
  { key: '1M', label: 'period.1m', tooltip: 'period.tip.1m' },
];

export const ReportingPeriodBar: React.FC<ReportingPeriodBarProps> = ({
  activePeriod,
  onPeriodChange,
  customRange,
  available,
  realFrom = null,
}) => {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(customRange?.fromDate || realFrom || today);
  const [toDate, setToDate] = useState(customRange?.toDate || today);
  const [errorMessage, setErrorMessage] = useState('');

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromDate || !toDate) {
      setErrorMessage(t('period.errorBoth'));
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      setErrorMessage(t('period.errorOrder'));
      return;
    }

    setErrorMessage('');
    setIsModalOpen(false);
    onPeriodChange('Custom', { fromDate, toDate });
  };

  // With nothing to choose between ("All" is the only true window), there is no picker to show.
  const offered = PERIODS.filter((p) => available.includes(p.key));
  const canPickRange = available.includes('Custom');
  if (offered.length <= 1 && !canPickRange) return null;

  return (
    <div className="reporting-period-container">
      <div className="reporting-period-rail">
        <nav className="segmented-control-rail" aria-label={t('period.label')}>
          {offered.map((p) => {
            const isActive = activePeriod === p.key;
            return (
              <button
                key={p.key}
                type="button"
                title={t(p.tooltip)}
                onClick={() => onPeriodChange(p.key)}
                className={`segmented-control-pill ${isActive ? 'segmented-control-pill--active' : ''}`}
                aria-pressed={isActive}
              >
                {t(p.label)}
              </button>
            );
          })}

          {canPickRange && (
          <button
            type="button"
            id="open-custom-reporting-period-modal"
            title={t('period.tip.custom')}
            onClick={() => setIsModalOpen(true)}
            className={`segmented-control-pill ${activePeriod === 'Custom' ? 'segmented-control-pill--active' : ''}`}
            aria-pressed={activePeriod === 'Custom'}
          >
            <Calendar size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {t('period.custom')}
            {activePeriod === 'Custom' && customRange ? ` (${customRange.fromDate} → ${customRange.toDate})` : ''}
          </button>
          )}
        </nav>
      </div>

      {/* Custom Reporting Period Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content custom-period-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('period.customTitle')}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyCustom}>
              <div className="modal-body">
                <div className="form-row-dates">
                  <div className="form-group">
                    <label htmlFor="custom-from-date" className="form-label">
                      {t('period.from')}
                    </label>
                    <input
                      type="date"
                      id="custom-from-date"
                      value={fromDate}
                      min={realFrom ?? undefined}
                      max={today}
                      onChange={(e) => {
                        setFromDate(e.target.value);
                        setErrorMessage('');
                      }}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="custom-to-date" className="form-label">
                      {t('period.to')}
                    </label>
                    <input
                      type="date"
                      id="custom-to-date"
                      value={toDate}
                      min={realFrom ?? undefined}
                      max={today}
                      onChange={(e) => {
                        setToDate(e.target.value);
                        setErrorMessage('');
                      }}
                      className="form-input"
                      required
                    />
                  </div>
                </div>

                {errorMessage && (
                  <p className="form-error-text" role="alert">
                    {errorMessage}
                  </p>
                )}
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn-primary-apply">
                  {t('period.apply')}
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportingPeriodBar;
