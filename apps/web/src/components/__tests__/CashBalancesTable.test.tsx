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

    expect(screen.getByText(/No uninvested cash balance/i)).toBeInTheDocument();
  });
});
