import { intlLocale } from '../i18n/locale';
import React from 'react';
import { formatCurrency } from '../data/sampleChartData';
import { useTranslation } from '../i18n/useTranslation';
import { currencyName } from '../lib/currencies';
import { displayLocale } from '../lib/money';

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
  const { t, locale } = useTranslation();
  // If cashBalances is provided and has items, use them; otherwise fallback to single cashBalance
  const items: CashBalanceItem[] = React.useMemo(() => {
    if (cashBalances && cashBalances.length > 0) {
      return cashBalances;
    }
    if (cashBalance > 0) {
      const name = currencyName(reportingCurrency, intlLocale(locale));
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
  }, [cashBalances, cashBalance, reportingCurrency, locale]);

  const formatNativeBalance = (amount: number, curr: string) => {
    switch (curr.toUpperCase()) {
      case 'USD':
        return `$${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'EUR':
        return `€${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'GBP':
        return `£${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'CHF':
        return `CHF ${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'JPY':
        return `¥${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      default:
        return `${amount.toLocaleString(displayLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
    }
  };

  return (
    <section className="cash-row" id="cash-balances" data-dashboard-section="" aria-label={t('cash.title')}>
      <h2 className="cash-row__title">{t('cash.title')}</h2>
      {items.length === 0 ? (
        <span className="cash-row__empty">{t('cash.empty')}</span>
      ) : (
        <ul className="cash-row__list">
          {items.map((item) => (
            <li key={item.currency} className="cash-pill" title={currencyName(item.currency, displayLocale())}>
              <span className="cash-pill__currency">{item.currency}</span>
              <span className="cash-pill__amount">{formatNativeBalance(item.balance, item.currency)}</span>
              {item.currency.toUpperCase() !== reportingCurrency.toUpperCase() && (
                <span className="cash-pill__converted">
                  ≈ {formatCurrency(item.balanceInReportingCurrency, reportingCurrency)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CashBalancesTable;
