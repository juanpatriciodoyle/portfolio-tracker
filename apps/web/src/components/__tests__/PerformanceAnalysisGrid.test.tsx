import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PerformanceAnalysisGrid, { type PerformanceStats } from '../PerformanceAnalysisGrid';
import { type ChartDataPoint } from '../../data/sampleChartData';

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

  const mockHistoryData: ChartDataPoint[] = [
    {
      date_time: '2024-01-01T00:00:00.000Z',
      portfolio_value_in_reporting_currency: 20000,
      cumulative_cost_in_reporting_currency: 20000,
      cashflow_in_reporting_currency: 20000,
      benchmark_value_in_reporting_currency: 20000,
      cumulative_time_weighted_return_rate: 0,
      cumulative_benchmark_time_weighted_return_rate: 0,
    },
    {
      date_time: '2024-03-01T00:00:00.000Z',
      portfolio_value_in_reporting_currency: 22000,
      cumulative_cost_in_reporting_currency: 20000,
      cashflow_in_reporting_currency: 0,
      benchmark_value_in_reporting_currency: 20500,
      cumulative_time_weighted_return_rate: 0.1,
      cumulative_benchmark_time_weighted_return_rate: 0.025,
    },
    {
      date_time: '2024-06-01T00:00:00.000Z',
      portfolio_value_in_reporting_currency: 23500,
      cumulative_cost_in_reporting_currency: 20000,
      cashflow_in_reporting_currency: 0,
      benchmark_value_in_reporting_currency: 21200,
      cumulative_time_weighted_return_rate: 0.175,
      cumulative_benchmark_time_weighted_return_rate: 0.06,
    },
  ];

  it('should render all 8 performance analysis metric tiles', () => {
    render(
      <PerformanceAnalysisGrid
        stats={mockStats}
        historyData={mockHistoryData}
        period="All"
        isRealInflationMode={false}
      />
    );

    // 1. Portfolio performance
    expect(screen.getByText('Portfolio performance')).toBeInTheDocument();
    expect(screen.getByText('+17.50 %/year')).toBeInTheDocument();
    expect(screen.getAllByText('€3,500.00').length).toBeGreaterThan(0);

    // 2. Volatility
    expect(screen.getByText('Volatility')).toBeInTheDocument();

    // 3. Risk-adjusted return
    expect(screen.getByText('Risk-adjusted return')).toBeInTheDocument();

    // 4. Active return
    expect(screen.getByText('Active return')).toBeInTheDocument();

    // 5. Net contributions
    expect(screen.getByText('Net contributions')).toBeInTheDocument();
    expect(screen.getByText('€20,000.00')).toBeInTheDocument();

    // 6. Price contribution
    expect(screen.getByText('Price contribution')).toBeInTheDocument();
    expect(screen.getByText('+17.50 pp/year')).toBeInTheDocument();

    // 7. Income contribution
    expect(screen.getByText('Income contribution')).toBeInTheDocument();
    expect(screen.getByText('+1.25 pp/year')).toBeInTheDocument();

    // 8. Cost contribution
    expect(screen.getByText('Cost contribution')).toBeInTheDocument();
    expect(screen.getByText('-0.22 pp/year')).toBeInTheDocument();
    expect(screen.getByText('-€45.00')).toBeInTheDocument();
  });

  it('should open and close help popover for metrics', () => {
    render(
      <PerformanceAnalysisGrid
        stats={mockStats}
        historyData={mockHistoryData}
        period="All"
        isRealInflationMode={false}
      />
    );

    const helpBtn = screen.getByLabelText('Learn about Portfolio performance');
    fireEvent.click(helpBtn);

    expect(screen.getByText(/Time-weighted return shows how the portfolio performed/i)).toBeInTheDocument();

    fireEvent.click(helpBtn);
    expect(screen.queryByText(/Time-weighted return shows how the portfolio performed/i)).not.toBeInTheDocument();
  });

  it('should open Sharpe ratio rating table popover', () => {
    render(
      <PerformanceAnalysisGrid
        stats={mockStats}
        historyData={mockHistoryData}
        period="All"
        isRealInflationMode={false}
      />
    );

    const sharpeHelpBtn = screen.getByLabelText('Learn about Risk-adjusted return');
    fireEvent.click(sharpeHelpBtn);

    expect(screen.getByText('Sharpe Ratio Ratings')).toBeInTheDocument();
    expect(screen.getByText('Below risk-free')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
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
        historyData={[]}
        period="All"
        isRealInflationMode={false}
      />
    );

    expect(screen.getByText('0.00 %/year')).toBeInTheDocument();
    expect(screen.getAllByText('€0.00').length).toBeGreaterThan(0);
    expect(screen.getByText('0.0 %')).toBeInTheDocument();
    expect(screen.getAllByText('0.00 pp/year').length).toBeGreaterThan(0);
  });
});
