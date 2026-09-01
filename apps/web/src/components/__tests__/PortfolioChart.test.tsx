import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportingPeriodBar from '../ReportingPeriodBar';
import PortfolioChart from '../PortfolioChart';
import {
  type ChartDataPoint,
  filterDataByPeriod,
  formatCurrency,
  formatPercent,
} from '../../data/sampleChartData';

// Realistic sample test fixture for unit tests
const testHistoryData: ChartDataPoint[] = [
  {
    date_time: '2024-01-01T00:00:00.000Z',
    portfolio_value_in_reporting_currency: 10000.0,
    cumulative_cost_in_reporting_currency: 10000.0,
    cashflow_in_reporting_currency: 10000.0,
    benchmark_value_in_reporting_currency: 10000.0,
    cumulative_time_weighted_return_rate: 0,
    cumulative_benchmark_time_weighted_return_rate: 0,
  },
  {
    date_time: '2024-03-01T00:00:00.000Z',
    portfolio_value_in_reporting_currency: 11200.0,
    cumulative_cost_in_reporting_currency: 10000.0,
    cashflow_in_reporting_currency: 0,
    benchmark_value_in_reporting_currency: 10500.0,
    cumulative_time_weighted_return_rate: 0.12,
    cumulative_benchmark_time_weighted_return_rate: 0.05,
  },
  {
    date_time: '2024-06-01T00:00:00.000Z',
    portfolio_value_in_reporting_currency: 12500.0,
    cumulative_cost_in_reporting_currency: 10000.0,
    cashflow_in_reporting_currency: 0,
    benchmark_value_in_reporting_currency: 10800.0,
    cumulative_time_weighted_return_rate: 0.25,
    cumulative_benchmark_time_weighted_return_rate: 0.08,
  },
  {
    date_time: '2024-09-01T00:00:00.000Z',
    portfolio_value_in_reporting_currency: 14000.0,
    cumulative_cost_in_reporting_currency: 10000.0,
    cashflow_in_reporting_currency: 0,
    benchmark_value_in_reporting_currency: 11200.0,
    cumulative_time_weighted_return_rate: 0.40,
    cumulative_benchmark_time_weighted_return_rate: 0.12,
  },
];

describe('Chart filter and format utilities', () => {
  it('should filter custom date ranges correctly', () => {
    const { filteredData } = filterDataByPeriod(testHistoryData, 'Custom', {
      fromDate: '2024-01-01',
      toDate: '2024-05-01',
    });
    expect(filteredData.length).toBe(2);
    expect(filteredData[0].date_time).toBe('2024-01-01T00:00:00.000Z');
    expect(filteredData[1].date_time).toBe('2024-03-01T00:00:00.000Z');
  });

  it('should format currency correctly', () => {
    expect(formatCurrency(123456.78, 'EUR')).toContain('€123,456.78');
    expect(formatCurrency(500, 'USD')).toContain('$500.00');
  });

  it('should format percentage with plus sign', () => {
    expect(formatPercent(16.91)).toBe('+16.91%');
    expect(formatPercent(-5.2)).toBe('-5.20%');
  });
});

describe('ReportingPeriodBar Component', () => {
  it('should render all preset periods', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('YTD')).toBeInTheDocument();
    expect(screen.getByText('1Y')).toBeInTheDocument();
    expect(screen.getByText('MTD')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.getByText('1W')).toBeInTheDocument();
    expect(screen.getByText('1D')).toBeInTheDocument();
    expect(screen.getByText('Last year')).toBeInTheDocument();
    expect(screen.getByText('Last month')).toBeInTheDocument();
    expect(screen.getByText(/Custom/i)).toBeInTheDocument();
  });

  it('should trigger onPeriodChange when clicking a period button', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} />);

    fireEvent.click(screen.getByText('1Y'));
    expect(onPeriodChange).toHaveBeenCalledWith('1Y');
  });

  it('should open custom date modal and apply valid date range', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} />);

    fireEvent.click(screen.getByText(/Custom/i));
    expect(screen.getByText('Custom Reporting Period')).toBeInTheDocument();

    const fromInput = screen.getByLabelText(/From/i);
    const toInput = screen.getByLabelText(/To/i);

    fireEvent.change(fromInput, { target: { value: '2024-01-01' } });
    fireEvent.change(toInput, { target: { value: '2024-12-31' } });

    fireEvent.click(screen.getByText('Apply Period'));
    expect(onPeriodChange).toHaveBeenCalledWith('Custom', {
      fromDate: '2024-01-01',
      toDate: '2024-12-31',
    });
  });

  it('should show error message if From date is after To date', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} />);

    fireEvent.click(screen.getByText(/Custom/i));

    const fromInput = screen.getByLabelText(/From/i);
    const toInput = screen.getByLabelText(/To/i);

    fireEvent.change(fromInput, { target: { value: '2025-01-01' } });
    fireEvent.change(toInput, { target: { value: '2024-01-01' } });

    fireEvent.click(screen.getByText('Apply Period'));
    expect(screen.getByText('From date cannot be after to date.')).toBeInTheDocument();
    expect(onPeriodChange).not.toHaveBeenCalled();
  });
});

describe('PortfolioChart Component', () => {
  it('should render chart header amount, percentage return, and controls with real live data', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    expect(screen.getByText(/€14,000.00/)).toBeInTheDocument();
    expect(screen.getByText(/%/)).toBeInTheDocument();

    // Mode buttons
    expect(screen.getByRole('button', { name: 'Value' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Profit/loss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Performance' })).toBeInTheDocument();

    // Legend items
    expect(screen.getByRole('button', { name: /Portfolio value/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Net contributions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Benchmark value/i })).toBeInTheDocument();
  });

  it('should switch chart modes when mode buttons are clicked', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    const profitLossBtn = screen.getByRole('button', { name: 'Profit/loss' });
    fireEvent.click(profitLossBtn);
    expect(profitLossBtn).toHaveClass('segmented-control__item--active');
    expect(screen.getByRole('button', { name: /Cumulative profit\/loss/i })).toBeInTheDocument();

    const performanceBtn = screen.getByRole('button', { name: 'Performance' });
    fireEvent.click(performanceBtn);
    expect(performanceBtn).toHaveClass('segmented-control__item--active');
    expect(screen.getByRole('button', { name: /Portfolio performance/i })).toBeInTheDocument();
  });

  it('should toggle legend items', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    const benchmarkLegend = screen.getByRole('button', { name: /Benchmark value/i });
    expect(benchmarkLegend).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(benchmarkLegend);
    expect(benchmarkLegend).toHaveAttribute('aria-pressed', 'false');
    expect(benchmarkLegend).toHaveClass('portfolio-chart-legend-item--muted');
  });

  it('should render €0.00 and 0.00% when user has a fresh account with 0 net worth', () => {
    const zeroData: ChartDataPoint[] = [
      {
        date_time: new Date().toISOString(),
        portfolio_value_in_reporting_currency: 0,
        cumulative_cost_in_reporting_currency: 0,
        cashflow_in_reporting_currency: 0,
        benchmark_value_in_reporting_currency: 0,
        cumulative_time_weighted_return_rate: 0,
        cumulative_benchmark_time_weighted_return_rate: 0,
      },
    ];

    render(<PortfolioChart data={zeroData} period="All" currency="EUR" />);

    expect(screen.getByText('€0.00')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByText('%/year')).toBeInTheDocument();
    expect(screen.getByText('(€0.00)')).toBeInTheDocument();
  });

  it('should render exact live figures when user has real logged transactions', () => {
    const liveUserData: ChartDataPoint[] = [
      {
        date_time: '2024-01-10T00:00:00.000Z',
        portfolio_value_in_reporting_currency: 5000.0,
        cumulative_cost_in_reporting_currency: 5000.0,
        cashflow_in_reporting_currency: 5000.0,
        benchmark_value_in_reporting_currency: 5000.0,
        cumulative_time_weighted_return_rate: 0,
        cumulative_benchmark_time_weighted_return_rate: 0,
      },
      {
        date_time: '2024-06-15T00:00:00.000Z',
        portfolio_value_in_reporting_currency: 6200.0,
        cumulative_cost_in_reporting_currency: 5000.0,
        cashflow_in_reporting_currency: 0,
        benchmark_value_in_reporting_currency: 5250.0,
        cumulative_time_weighted_return_rate: 0.24,
        cumulative_benchmark_time_weighted_return_rate: 0.05,
      },
    ];

    render(<PortfolioChart data={liveUserData} period="All" currency="EUR" />);

    expect(screen.getByText('€6,200.00')).toBeInTheDocument();
    expect(screen.getByText(/\(€1,200.00\)/)).toBeInTheDocument();
  });
});
