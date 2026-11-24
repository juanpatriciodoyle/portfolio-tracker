import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CashBalancesTable from '../CashBalancesTable';

describe('CashBalancesTable: one way to write a negative amount', () => {
  it('puts the sign before the symbol, never "€-88,171.00"', () => {
    render(
      <CashBalancesTable
        cashBalance={-87000}
        reportingCurrency="EUR"
        cashBalances={[
          { currency: 'EUR', balance: -88171, balanceInReportingCurrency: -88171, percentage: 100 },
          { currency: 'USD', balance: -12.5, balanceInReportingCurrency: -10.78, percentage: 0 },
        ]}
      />,
    );

    expect(screen.getByText('-€88,171.00')).toBeInTheDocument();
    expect(screen.getByText('-$12.50')).toBeInTheDocument();
    expect(screen.queryByText(/€-|\$-/)).not.toBeInTheDocument();
  });
});
