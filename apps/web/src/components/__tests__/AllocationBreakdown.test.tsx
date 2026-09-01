import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AllocationBreakdown from '../AllocationBreakdown';
import { type PositionItem } from '../HoldingsTable';

describe('AllocationBreakdown Component', () => {
  const mockBreakdowns = {
    sectors: [
      { name: 'Technology', amount: 120000, percentage: 60.0 },
      { name: 'Financials', amount: 80000, percentage: 40.0 },
    ],
    regions: [
      { name: 'North America', amount: 150000, percentage: 75.0 },
      { name: 'Europe', amount: 50000, percentage: 25.0 },
    ],
    assetClasses: [
      { name: 'Equity', amount: 160000, percentage: 80.0 },
      { name: 'Fixed Income', amount: 40000, percentage: 20.0 },
    ],
  };

  const mockPositions: PositionItem[] = [
    {
      id: 'pos-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: 'Equity',
      region: 'North America',
      sector: 'Technology',
      quantity: 500,
      investedAmount: 75000,
      currentPrice: 200,
      currentValue: 100000,
    },
    {
      id: 'pos-2',
      symbol: 'VUAA.DE',
      name: 'Vanguard S&P 500 UCITS ETF',
      assetClass: 'Equity',
      region: 'Global',
      sector: 'Diversified',
      quantity: 1000,
      investedAmount: 75000,
      currentPrice: 90,
      currentValue: 90000,
    },
  ];

  it('should render header title and 4 breakdown tabs', () => {
    render(
      <AllocationBreakdown
        breakdowns={mockBreakdowns}
        positions={mockPositions}
        cashBalance={10000}
        netWorth={200000}
        currency="EUR"
      />
    );

    expect(screen.getByText('Allocation')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sectors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Regions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Asset classes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Holdings' })).toBeInTheDocument();
  });

  it('should render items for default Sectors tab', () => {
    render(
      <AllocationBreakdown
        breakdowns={mockBreakdowns}
        positions={mockPositions}
        cashBalance={10000}
        netWorth={200000}
        currency="EUR"
      />
    );

    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('should switch between tabs and display corresponding items', () => {
    render(
      <AllocationBreakdown
        breakdowns={mockBreakdowns}
        positions={mockPositions}
        cashBalance={10000}
        netWorth={200000}
        currency="EUR"
      />
    );

    // Switch to Regions tab
    fireEvent.click(screen.getByRole('tab', { name: 'Regions' }));
    expect(screen.getByText('North America')).toBeInTheDocument();
    expect(screen.getByText('Europe')).toBeInTheDocument();

    // Switch to Asset classes tab
    fireEvent.click(screen.getByRole('tab', { name: 'Asset classes' }));
    expect(screen.getByText('Equity')).toBeInTheDocument();
    expect(screen.getByText('Fixed Income')).toBeInTheDocument();

    // Switch to Holdings tab
    fireEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Vanguard S&P 500 UCITS ETF')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('should update center overlay on hovering over a legend item', () => {
    render(
      <AllocationBreakdown
        breakdowns={mockBreakdowns}
        positions={mockPositions}
        cashBalance={10000}
        netWorth={200000}
        currency="EUR"
      />
    );

    const techItem = screen.getByText('Technology').closest('.dashboard-allocation__legend-item')!;
    fireEvent.mouseEnter(techItem);

    // Center overlay displays hovered item name and percentage
    expect(screen.getAllByText('Technology').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('60.0%').length).toBeGreaterThanOrEqual(1);

    fireEvent.mouseLeave(techItem);
  });

  it('should render empty state when no breakdown data exists', () => {
    render(
      <AllocationBreakdown
        breakdowns={{ sectors: [], regions: [], assetClasses: [] }}
        positions={[]}
        cashBalance={0}
        netWorth={0}
        currency="EUR"
      />
    );

    expect(screen.getByText(/No allocation data recorded yet/i)).toBeInTheDocument();
  });
});
