import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { setActiveLocale } from '../../i18n/activeLocale';
import CashBalancesTable, { type CashBalanceItem } from '../CashBalancesTable';

describe('CashBalancesTable Component', () => {
  const mockCashBalances: CashBalanceItem[] = [
    {
      currency: 'USD',
      name: 'US Dollar',
      currencySymbol: '$',
      balance: 3141.05,
      balanceInReportingCurrency: 2708.73,
      percentage: 73.32,
    },
    {
      currency: 'EUR',
      name: 'Euro',
      currencySymbol: '€',
      balance: 985.86,
      balanceInReportingCurrency: 985.86,
      percentage: 26.68,
    },
  ];

  it('should render all currency rows with native balance and reporting currency balance', () => {
    render(
      <CashBalancesTable
        cashBalances={mockCashBalances}
        cashBalance={3694.59}
        reportingCurrency="EUR"
      />
    );

    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('$3,141.05')).toBeInTheDocument();
    // Only a foreign currency shows its worth in the reporting currency
    expect(screen.getByText('≈ €2,708.73')).toBeInTheDocument();

    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getAllByText('€985.86')).toHaveLength(1);
  });

  it('should fallback to single base cash balance when multi-currency breakdown is not provided', () => {
    render(
      <CashBalancesTable
        cashBalances={[]}
        cashBalance={1500}
        reportingCurrency="EUR"
      />
    );

    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getAllByText('€1,500.00')).toHaveLength(1);
  });

  it('should render clean empty state when there is 0 uninvested cash', () => {
    render(
      <CashBalancesTable
        cashBalances={[]}
        cashBalance={0}
        reportingCurrency="EUR"
      />
    );

    expect(screen.getByText(/You hold no cash/i)).toBeInTheDocument();
  });

  describe('when cash sits idle', () => {
    const eurOnly: CashBalanceItem[] = [{ currency: 'EUR', name: 'Euro', currencySymbol: '€', balance: 24500, balanceInReportingCurrency: 24500, percentage: 100 }];
    const idle = (over: Partial<React.ComponentProps<typeof CashBalancesTable>> = {}) =>
      render(
        <CashBalancesTable
          cashBalances={eurOnly}
          cashBalance={24500}
          reportingCurrency="EUR"
          netWorth={200000}
          inflationRatePercent={2.9}
          country="Spain"
          {...over}
        />
      );

    afterEach(() => {
      cleanup();
      setActiveLocale(null);
    });

    it('says in one sentence how much is cash and what a year of inflation takes from it', () => {
      idle();
      expect(
        screen.getByText('€24,500 (12% of your total) is cash. At 2.9% inflation (Spain) that loses about €710 of buying power a year.')
      ).toBeInTheDocument();
    });

    it('puts the sentence where the currency pills were, and keeps them one tap away', () => {
      idle();
      expect(screen.queryByText('€24,500.00')).not.toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: 'By currency' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);
      expect(screen.getByRole('button', { name: 'Hide currencies' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('EUR')).toBeInTheDocument();
      expect(screen.getByText('€24,500.00')).toBeInTheDocument();
    });

    it('adds "plus currency moves" when some of the cash is in another currency', () => {
      idle({
        cashBalances: [
          { currency: 'EUR', name: 'Euro', balance: 10000, balanceInReportingCurrency: 10000, percentage: 41 },
          { currency: 'USD', name: 'US Dollar', balance: 15800, balanceInReportingCurrency: 14500, percentage: 59 },
        ],
      });
      expect(screen.getByText(/of buying power a year, plus currency moves\./)).toBeInTheDocument();
    });

    it('is only a fact: it never tells anyone what to do', () => {
      idle();
      expect(screen.getByText(/is cash\./).textContent).not.toMatch(/should|invest it|consider|advice/i);
    });

    it.each([
      ['cash is a small share of the total', { netWorth: 500000 }],
      ['the balance is small', { cashBalance: 900, netWorth: 1000 }],
      ['no inflation rate is known', { inflationRatePercent: undefined }],
    ])('shows the currency pills as before when %s', (_why, over) => {
      idle(over);
      expect(screen.queryByText(/is cash\./)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'By currency' })).not.toBeInTheDocument();
      expect(screen.getByText('EUR')).toBeInTheDocument();
    });

    it('speaks Argentine Spanish when the screen does', () => {
      render(
        <LocaleProvider initial="es-AR">
          <CashBalancesTable cashBalances={eurOnly} cashBalance={24500} reportingCurrency="EUR" netWorth={200000} inflationRatePercent={2.9} country="Spain" />
        </LocaleProvider>
      );
      expect(screen.getByText(/está en efectivo\. Con una inflación del 2,9% \(España\)/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Por moneda' })).toBeInTheDocument();
    });
  });
});
