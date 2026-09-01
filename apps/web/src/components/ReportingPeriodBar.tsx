import React, { useState } from 'react';
import type { ReportingPeriod, DateRange } from '../data/sampleChartData';
import { Calendar, X } from 'lucide-react';

interface ReportingPeriodBarProps {
  activePeriod: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod, customRange?: DateRange) => void;
  customRange?: DateRange;
}

const PERIODS: { key: ReportingPeriod; label: string; tooltip: string }[] = [
  { key: 'All', label: 'All', tooltip: 'All historical time' },
  { key: 'YTD', label: 'YTD', tooltip: 'Year to date (Jan 1 - today)' },
  { key: '1Y', label: '1Y', tooltip: 'Past 365 days' },
  { key: 'MTD', label: 'MTD', tooltip: 'Month to date' },
  { key: '1M', label: '1M', tooltip: 'Past 30 days' },
  { key: '1W', label: '1W', tooltip: 'Past 7 days' },
  { key: '1D', label: '1D', tooltip: 'Yesterday / 1 Day' },
  { key: 'Last year', label: 'Last year', tooltip: 'Full previous calendar year' },
  { key: 'Last month', label: 'Last month', tooltip: 'Full previous calendar month' },
];

export const ReportingPeriodBar: React.FC<ReportingPeriodBarProps> = ({
  activePeriod,
  onPeriodChange,
  customRange,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(customRange?.fromDate || '2020-01-01');
  const [toDate, setToDate] = useState(customRange?.toDate || new Date().toISOString().split('T')[0]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromDate || !toDate) {
      setErrorMessage('Please select both from and to dates.');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      setErrorMessage('From date cannot be after to date.');
      return;
    }

    setErrorMessage('');
    setIsModalOpen(false);
    onPeriodChange('Custom', { fromDate, toDate });
  };

  return (
    <div className="reporting-period-container">
      <div className="reporting-period-rail">
        <nav className="segmented-control-rail" aria-label="Reporting period">
          {PERIODS.map((p) => {
            const isActive = activePeriod === p.key;
            return (
              <button
                key={p.key}
                type="button"
                title={p.tooltip}
                onClick={() => onPeriodChange(p.key)}
                className={`segmented-control-pill ${isActive ? 'segmented-control-pill--active' : ''}`}
                aria-pressed={isActive}
              >
                {p.label}
              </button>
            );
          })}

          <button
            type="button"
            id="open-custom-reporting-period-modal"
            title="Custom date range"
            onClick={() => setIsModalOpen(true)}
            className={`segmented-control-pill ${activePeriod === 'Custom' ? 'segmented-control-pill--active' : ''}`}
            aria-pressed={activePeriod === 'Custom'}
          >
            <Calendar size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Custom
            {activePeriod === 'Custom' && customRange ? ` (${customRange.fromDate} → ${customRange.toDate})` : ''}
          </button>
        </nav>
      </div>

      {/* Custom Reporting Period Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content custom-period-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Custom Reporting Period</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyCustom}>
              <div className="modal-body">
                <div className="form-row-dates">
                  <div className="form-group">
                    <label htmlFor="custom-from-date" className="form-label">
                      From
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
                      To
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
                  Apply Period
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
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
