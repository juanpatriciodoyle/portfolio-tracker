import React, { useState } from 'react';
import type { ReportingPeriod, DateRange } from '../data/sampleChartData';
import { Calendar, X } from 'lucide-react';
import type { MessageKey } from '../i18n/catalogs';
import { useTranslation } from '../i18n/useTranslation';

interface ReportingPeriodBarProps {
  activePeriod: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod, customRange?: DateRange) => void;
  customRange?: DateRange;
}

const PERIODS: { key: ReportingPeriod; label: MessageKey; tooltip: MessageKey }[] = [
  { key: 'All', label: 'period.all', tooltip: 'period.tip.all' },
  { key: 'YTD', label: 'period.ytd', tooltip: 'period.tip.ytd' },
  { key: '1Y', label: 'period.1y', tooltip: 'period.tip.1y' },
  { key: 'MTD', label: 'period.mtd', tooltip: 'period.tip.mtd' },
  { key: '1M', label: 'period.1m', tooltip: 'period.tip.1m' },
  { key: '1W', label: 'period.1w', tooltip: 'period.tip.1w' },
  { key: '1D', label: 'period.1d', tooltip: 'period.tip.1d' },
  { key: 'Last year', label: 'period.lastYear', tooltip: 'period.tip.lastYear' },
  { key: 'Last month', label: 'period.lastMonth', tooltip: 'period.tip.lastMonth' },
];

export const ReportingPeriodBar: React.FC<ReportingPeriodBarProps> = ({
  activePeriod,
  onPeriodChange,
  customRange,
}) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(customRange?.fromDate || '2020-01-01');
  const [toDate, setToDate] = useState(customRange?.toDate || new Date().toISOString().split('T')[0]);
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

  return (
    <div className="reporting-period-container">
      <div className="reporting-period-rail">
        <nav className="segmented-control-rail" aria-label={t('period.label')}>
          {PERIODS.map((p) => {
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
