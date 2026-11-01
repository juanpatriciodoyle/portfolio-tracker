import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PerformanceAnalysisGrid, { type PerformanceStats } from '../PerformanceAnalysisGrid';

describe('PerformanceAnalysisGrid Component', () => {
  const mockStats: PerformanceStats = {
    netWorth: 25000,
    cashBalance: 5000,
    totalInvested: 20000,
    openInvestedValue: 20000,
    soldProfit: 3500,
    totalProfit: 3500,
    totalFees: 45,
    totalIncome: 250,
    allTimeRoiPercent: 17.5,
    realProfitEuros: 3100,
    realRoiPercent: 15.5,
    baseCurrency: 'EUR',
  };

  it('should render only the performance and cost tiles', () => {
    render(
      <PerformanceAnalysisGrid
        stats={mockStats}
        isRealInflationMode={false}
      />
    );

    expect(screen.getByText('Portfolio performance')).toBeInTheDocument();
    expect(screen.getByText('+17.50 %/year')).toBeInTheDocument();
    expect(screen.getByText('Cost contribution')).toBeInTheDocument();
    expect(screen.getByText('-0.22 pp/year')).toBeInTheDocument();
    expect(screen.getByText('-€45.00')).toBeInTheDocument();

    for (const removed of [
      'Volatility',
      'Risk-adjusted return',
      'Active return',
      'Net contributions',
      'Price contribution',
      'Income contribution',
    ]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
  });

  it('should open and close help popover for metrics', () => {
    render(
      <PerformanceAnalysisGrid
        stats={mockStats}
        isRealInflationMode={false}
      />
    );

    const helpBtn = screen.getByLabelText('Learn about Portfolio performance');
    fireEvent.click(helpBtn);

    expect(screen.getByText(/Time-weighted return shows how the portfolio performed/i)).toBeInTheDocument();

    fireEvent.click(helpBtn);
    expect(screen.queryByText(/Time-weighted return shows how the portfolio performed/i)).not.toBeInTheDocument();
  });

  it('should display clean 0 baseline when user has 0 net worth and no transactions', () => {
    const zeroStats: PerformanceStats = {
      netWorth: 0,
      cashBalance: 0,
      totalInvested: 0,
      openInvestedValue: 0,
      soldProfit: 0,
      totalProfit: 0,
      totalFees: 0,
      totalIncome: 0,
      allTimeRoiPercent: 0,
      realProfitEuros: 0,
      realRoiPercent: 0,
      baseCurrency: 'EUR',
    };

    render(
      <PerformanceAnalysisGrid
        stats={zeroStats}
        isRealInflationMode={false}
      />
    );

    expect(screen.getByText('0.00 %/year')).toBeInTheDocument();
    expect(screen.getAllByText('€0.00').length).toBeGreaterThan(0);
    expect(screen.getByText('0.00 pp/year')).toBeInTheDocument();
  });
});
