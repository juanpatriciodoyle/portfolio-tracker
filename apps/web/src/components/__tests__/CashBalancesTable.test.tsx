import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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

    // Section title
    expect(screen.getByText('Cash')).toBeInTheDocument();

    // Row 1: USD
    expect(screen.getByText('US Dollar')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('$3,141.05')).toBeInTheDocument();
    expect(screen.getByText('€2,708.73')).toBeInTheDocument();

    // Row 2: EUR
    expect(screen.getByText('Euro')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    // Using getAllByText for €985.86 since it appears in both native and reporting currency columns
    expect(screen.getAllByText('€985.86').length).toBe(2);
  });

  it('should fallback to single base cash balance when multi-currency breakdown is not provided', () => {
    render(
      <CashBalancesTable
        cashBalances={[]}
        cashBalance={1500}
        reportingCurrency="EUR"
      />
    );

    expect(screen.getByText('Euro')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getAllByText('€1,500.00').length).toBe(2);
  });

  it('should render clean empty state when there is 0 uninvested cash', () => {
    render(
      <CashBalancesTable
        cashBalances={[]}
        cashBalance={0}
        reportingCurrency="EUR"
      />
    );

    expect(screen.getByText(/No uninvested cash balance/i)).toBeInTheDocument();
  });
});
