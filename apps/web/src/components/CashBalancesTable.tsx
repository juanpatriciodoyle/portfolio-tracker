import { intlLocale } from '../i18n/locale';
import React from 'react';
import { formatCurrency } from '../data/sampleChartData';
import { useTranslation } from '../i18n/useTranslation';
import { dataLabel } from '../i18n/dataLabels';
import { currencyName } from '../lib/currencies';
import { idleCashNote } from '../lib/idleCash';
import { displayLocale, formatUpTo } from '../lib/money';

export interface CashBalanceItem {
  currency: string;
  /** Not sent by the API any more (the language and the currency code give both); kept optional for older answers. */
  name?: string;
  currencySymbol?: string;
  balance: number;
  balanceInReportingCurrency: number;
  percentage: number;
}

interface CashBalancesTableProps {
  cashBalances?: CashBalanceItem[];
  /** The cash figure of the home screen: the hero's own, never added up again here. */
  cashBalance?: number;
  reportingCurrency?: string;
  /** Everything the person has, cash included: it says how big a share the cash is. */
  netWorth?: number;
  /** The yearly price rise of the country behind the header chip, in percent. */
  inflationRatePercent?: number;
  country?: string;
}

export const CashBalancesTable: React.FC<CashBalancesTableProps> = ({
  cashBalances,
  cashBalance = 0,
  reportingCurrency = 'EUR',
  netWorth = 0,
  inflationRatePercent,
  country = '',
}) => {
  const { t, locale } = useTranslation();
  const [showCurrencies, setShowCurrencies] = React.useState(false);
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

  /** A balance in its own currency. A negative one is always written "-€1,800": the sign before the symbol, as everywhere else. */
  const formatNativeBalance = (amount: number, curr: string) => {
    const sign = amount < 0 ? '-' : '';
    const magnitude = Math.abs(amount);
    const digits = (fractionDigits: number) => magnitude.toLocaleString(displayLocale(), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    switch (curr.toUpperCase()) {
      case 'USD':
        return `${sign}$${digits(2)}`;
      case 'EUR':
        return `${sign}€${digits(2)}`;
      case 'GBP':
        return `${sign}£${digits(2)}`;
      case 'CHF':
        return `${sign}CHF ${digits(2)}`;
      case 'JPY':
        return `${sign}¥${digits(0)}`;
      default:
        return `${sign}${digits(2)} ${curr}`;
    }
  };

  const hasForeignCash = items.some((item) => item.currency.toUpperCase() !== reportingCurrency.toUpperCase() && item.balance !== 0);
  const note = idleCashNote({ cash: cashBalance, total: netWorth, inflationRatePercent, hasForeignCash });

  const pills = (
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
  );

  return (
    <section className="cash-row" id="cash-balances" data-dashboard-section="" aria-label={t('cash.title')}>
      <h2 className="cash-row__title">{t('cash.title')}</h2>
      {items.length === 0 ? (
        <span className="cash-row__empty">{t('cash.empty')}</span>
      ) : note && inflationRatePercent !== undefined ? (
        <div className="cash-note">
          <p className="cash-note__text">
            {t(note.hasForeignCash ? 'cash.idleWithCurrency' : 'cash.idle', {
              amount: formatCurrency(note.cash, reportingCurrency, 0),
              percent: note.sharePercent,
              rate: formatUpTo(note.inflationRatePercent, 1),
              country: dataLabel(t, 'country', country),
              loss: formatCurrency(note.annualLoss, reportingCurrency, 0),
            })}
          </p>
          <button type="button" className="cash-note__toggle" aria-expanded={showCurrencies} onClick={() => setShowCurrencies(!showCurrencies)}>
            {showCurrencies ? t('cash.hideCurrencies') : t('cash.byCurrency')}
          </button>
          {showCurrencies && pills}
        </div>
      ) : (
        pills
      )}
    </section>
  );
};

export default CashBalancesTable;
