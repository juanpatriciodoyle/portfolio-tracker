import React from 'react';
import { formatCurrency } from '../data/sampleChartData';

export interface CashBalanceItem {
  currency: string;
  name: string;
  currencySymbol?: string;
  balance: number;
  balanceInReportingCurrency: number;
  percentage: number;
}

interface CashBalancesTableProps {
  cashBalances?: CashBalanceItem[];
  cashBalance?: number;
  reportingCurrency?: string;
}

export const CashBalancesTable: React.FC<CashBalancesTableProps> = ({
  cashBalances,
  cashBalance = 0,
  reportingCurrency = 'EUR',
}) => {
  // If cashBalances is provided and has items, use them; otherwise fallback to single cashBalance
  const items: CashBalanceItem[] = React.useMemo(() => {
    if (cashBalances && cashBalances.length > 0) {
      return cashBalances;
    }
    if (cashBalance > 0) {
      const name = reportingCurrency === 'USD' ? 'US Dollar' : reportingCurrency === 'GBP' ? 'British Pound' : 'Euro';
      return [
        {
          currency: reportingCurrency,
          name,
          currencySymbol: reportingCurrency === 'USD' ? '$' : reportingCurrency === 'GBP' ? '£' : '€',
          balance: cashBalance,
          balanceInReportingCurrency: cashBalance,
          percentage: 100,
        },
      ];
    }
    return [];
  }, [cashBalances, cashBalance, reportingCurrency]);

  const formatNativeBalance = (amount: number, curr: string) => {
    switch (curr.toUpperCase()) {
      case 'USD':
        return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'EUR':
        return `€${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'GBP':
        return `£${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'CHF':
        return `CHF ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'JPY':
        return `¥${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      default:
        return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
    }
  };

  return (
    <section
      className="portfolio-dashboard__section dashboard-section dashboard-section--flush"
      id="cash-balances"
      data-dashboard-section=""
    >
      <div className="dashboard-panel">
        <div className="dashboard-panel-header">
          <h2 className="dashboard-panel-title">Cash</h2>
        </div>

        <div className="dashboard-table-scroll dashboard-scroll-affordance dashboard-scroll-affordance--table dashboard-scroll-affordance--no-scroll">
          <div className="dashboard-table-wrapper dashboard-table-wrapper--cash">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--left">
                    Currency
                  </th>
                  <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                    Balance
                  </th>
                  <th className="dashboard-table-heading dashboard-table__head-cell dashboard-table__head-cell--right">
                    Balance in reporting currency
                  </th>
                </tr>
              </thead>

              <tbody className="dashboard-table__body">
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="dashboard-table__cell dashboard-table__cell--empty"
                      style={{ textAlign: 'center', padding: '24px 16px', color: '#71717A' }}
                    >
                      No uninvested cash balance.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.currency}>
                      {/* 1. Currency & Weight Bar */}
                      <td className="dashboard-table__cell dashboard-table__cell--asset">
                        <div className="dashboard-table-asset dashboard-table-asset--no-logo">
                          <div className="dashboard-table-asset__body">
                            <div className="dashboard-table-asset__name dashboard-table-asset__name--muted">
                              {item.name}
                            </div>
                            <div className="dashboard-table-asset__meta">{item.currency}</div>
                            <div className="dashboard-table-bar" aria-hidden="true">
                              <span
                                className="dashboard-table-bar__fill"
                                style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Native Balance */}
                      <td className="dashboard-table__cell dashboard-table__cell--numeric">
                        <div className="dashboard-table__value">
                          {formatNativeBalance(item.balance, item.currency)}
                        </div>
                      </td>

                      {/* 3. Balance in Reporting Currency */}
                      <td className="dashboard-table__cell dashboard-table__cell--numeric">
                        {formatCurrency(item.balanceInReportingCurrency, reportingCurrency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CashBalancesTable;
