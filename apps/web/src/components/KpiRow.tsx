import React from 'react';
import { formatCurrency } from '../data/sampleChartData';

interface KpiRowProps {
  netWorth: number;
  cashBalance: number;
  soldProfit: number;
  returnEuros: number;
  returnPercent: number;
  isRealInflationMode: boolean;
  country: string;
  currency?: string;
}

const signed = (amount: number, currency: string) =>
  `${amount >= 0 ? '+' : ''}${formatCurrency(amount, currency)}`;

const tone = (amount: number) => (amount >= 0 ? 'metric-tile__value--positive' : 'metric-tile__value--negative');

export const KpiRow: React.FC<KpiRowProps> = ({
  netWorth,
  cashBalance,
  soldProfit,
  returnEuros,
  returnPercent,
  isRealInflationMode,
  country,
  currency = 'EUR',
}) => (
  <section className="kpi-row" aria-label="Key figures">
    <div className="metric-tile kpi-row__tile">
      <span className="metric-tile__label">Net worth</span>
      <span className="kpi-row__value">{formatCurrency(netWorth, currency)}</span>
      <span className="kpi-row__note">Cash: {formatCurrency(cashBalance, currency)}</span>
    </div>

    <div className="metric-tile kpi-row__tile">
      <span className="metric-tile__label">Profit from sold assets</span>
      <span className={`kpi-row__value ${tone(soldProfit)}`}>{signed(soldProfit, currency)}</span>
      <span className="kpi-row__note">Earnings locked in from closed positions</span>
    </div>

    <div className="metric-tile kpi-row__tile">
      <span className="metric-tile__label">All time return</span>
      <span className={`kpi-row__value ${tone(returnEuros)}`}>{signed(returnEuros, currency)}</span>
      <span className="kpi-row__note">
        {`Return: ${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}% ${
          isRealInflationMode ? `(${country} inflation adj.)` : '(standard)'
        }`}
      </span>
    </div>
  </section>
);

export default KpiRow;
