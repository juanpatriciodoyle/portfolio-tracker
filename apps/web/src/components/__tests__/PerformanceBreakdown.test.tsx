import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PerformanceBreakdown, { type PerformancePeriodItem } from '../PerformanceBreakdown';

describe('PerformanceBreakdown Component', () => {
  const mockPeriods: PerformancePeriodItem[] = [
    {
      period_type: 'year',
      year: 2026,
      month: null,
      from_date: '2026-01-01T00:00:00.000Z',
      to_date: '2026-09-01T00:00:00.000Z',
      absolute_return_amount_in_reporting_currency: 28656.35,
      time_weighted_return_rate: 0.0916,
    },
    {
      period_type: 'month',
      year: 2026,
      month: 1,
      from_date: '2026-01-01T00:00:00.000Z',
      to_date: '2026-01-31T00:00:00.000Z',
      absolute_return_amount_in_reporting_currency: -14310.36,
      time_weighted_return_rate: -0.0458,
    },
    {
      period_type: 'month',
      year: 2026,
      month: 4,
      from_date: '2026-04-01T00:00:00.000Z',
      to_date: '2026-04-30T00:00:00.000Z',
      absolute_return_amount_in_reporting_currency: 19265.75,
      time_weighted_return_rate: 0.0668,
    },
    {
      period_type: 'year',
      year: 2025,
      month: null,
      from_date: '2025-01-01T00:00:00.000Z',
      to_date: '2025-12-31T00:00:00.000Z',
      absolute_return_amount_in_reporting_currency: -7161.39,
      time_weighted_return_rate: -0.0224,
    },
  ];

  it('should render header controls, segmented controls, and period tabs', () => {
    render(
      <PerformanceBreakdown
        periodsData={mockPeriods}
        currency="EUR"
      />
    );

    // Header title
    expect(screen.getByText('Performance')).toBeInTheDocument();

    // Unit toggle buttons
    expect(screen.getByText('P/L')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();

    // View toggle buttons
    expect(screen.getByText('Bar chart')).toBeInTheDocument();
    expect(screen.getByText('Heatmap')).toBeInTheDocument();

    // Period tabs
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TTM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2025' })).toBeInTheDocument();
  });

  it('should toggle between Bar chart and Heatmap views', () => {
    render(
      <PerformanceBreakdown
        periodsData={mockPeriods}
        currency="EUR"
      />
    );

    // Click Heatmap
    const heatmapBtn = screen.getByRole('button', { name: 'Heatmap' });
    fireEvent.click(heatmapBtn);

    // In Heatmap mode, month headers (Jan, Feb, etc.) are rendered
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    expect(screen.getByText('Dec')).toBeInTheDocument();

    // Switch back to Bar chart
    const barBtn = screen.getByRole('button', { name: 'Bar chart' });
    fireEvent.click(barBtn);
    expect(screen.getByRole('button', { name: 'Bar chart' })).toBeInTheDocument();
  });

  it('should switch return units between P/L and %', () => {
    render(
      <PerformanceBreakdown
        periodsData={mockPeriods}
        currency="EUR"
      />
    );

    // Switch to Heatmap
    fireEvent.click(screen.getByRole('button', { name: 'Heatmap' }));

    // In P/L mode, currency values like +€19.3K appear
    expect(screen.getByText('+€19.3K')).toBeInTheDocument();

    // Toggle unit to %
    const percentBtn = screen.getByRole('button', { name: '%' });
    fireEvent.click(percentBtn);

    // In % mode, percent values like +6.68% appear
    expect(screen.getByText('+6.68%')).toBeInTheDocument();
  });

  it('should filter periods when clicking period navigation tabs', () => {
    render(
      <PerformanceBreakdown
        periodsData={mockPeriods}
        currency="EUR"
      />
    );

    const year2026Tab = screen.getByRole('button', { name: '2026' });
    fireEvent.click(year2026Tab);
    expect(year2026Tab).toHaveClass('segmented-control__item--active');
  });

  it('should handle empty periods gracefully without breaking', () => {
    render(
      <PerformanceBreakdown
        periodsData={[]}
        currency="EUR"
      />
    );

    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Bar chart')).toBeInTheDocument();
  });
});
