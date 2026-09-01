import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HoldingsTable, { type PositionItem, type SoldAssetItem } from '../HoldingsTable';

describe('HoldingsTable Component', () => {
  const mockPositions: PositionItem[] = [
    {
      id: 'pos-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: 'Stock',
      region: 'North America',
      sector: 'Technology',
      quantity: 10,
      investedAmount: 1800,
      costPerShare: 180,
      currentPrice: 220,
      currentValue: 2200,
      holdingDays: 120,
    },
    {
      id: 'pos-2',
      symbol: 'BTC',
      name: 'Bitcoin',
      assetClass: 'Crypto',
      region: 'Global',
      sector: 'Cryptocurrency',
      quantity: 0.5,
      investedAmount: 30000,
      costPerShare: 60000,
      currentPrice: 65000,
      currentValue: 32500,
      holdingDays: 200,
    },
  ];

  const mockSoldAssets: SoldAssetItem[] = [
    {
      id: 'sold-1',
      symbol: 'SAN.MC',
      assetClass: 'Stock',
      region: 'Europe',
      sector: 'Financials',
      investedAmount: 1000,
      returnedAmount: 1250,
      soldProfit: 250,
      soldProfitPercent: 25,
      holdingInflationPercent: 2.5,
      realProfitEuros: 225,
      holdingDays: 45,
      date: '2024-05-01T00:00:00.000Z',
    },
  ];

  const netWorth = 34700;

  it('should render position rows with accurate figures, badges, and allocation bars', () => {
    render(
      <HoldingsTable
        positions={mockPositions}
        soldAssets={mockSoldAssets}
        netWorth={netWorth}
        currency="EUR"
      />
    );

    // Title
    expect(screen.getByText('Holdings')).toBeInTheDocument();

    // Row 1: Apple
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('120 days')).toBeInTheDocument();
    expect(screen.getByText('€1,800.00')).toBeInTheDocument();
    expect(screen.getByText('€180.00/share')).toBeInTheDocument();
    expect(screen.getByText('€2,200.00')).toBeInTheDocument();
    expect(screen.getByText('€220.00/share')).toBeInTheDocument();

    // Row 2: Bitcoin
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
    expect(screen.getByText('200 days')).toBeInTheDocument();
    expect(screen.getByText('€30,000.00')).toBeInTheDocument();
    expect(screen.getByText('€32,500.00')).toBeInTheDocument();
  });

  it('should sort table rows when clicking column headers', () => {
    render(
      <HoldingsTable
        positions={mockPositions}
        soldAssets={mockSoldAssets}
        netWorth={netWorth}
        currency="EUR"
      />
    );

    // Click Security column header to sort by name ASC
    const securityHeader = screen.getByText('Security');
    fireEvent.click(securityHeader);

    const rows = screen.getAllByRole('row');
    // Header is row 0, Apple should be row 1, Bitcoin should be row 2
    expect(rows[1]).toHaveTextContent('Apple Inc.');
    expect(rows[2]).toHaveTextContent('Bitcoin');

    // Click again to sort DESC
    fireEvent.click(securityHeader);
    const rowsDesc = screen.getAllByRole('row');
    expect(rowsDesc[1]).toHaveTextContent('Bitcoin');
    expect(rowsDesc[2]).toHaveTextContent('Apple Inc.');
  });

  it('should toggle column visibility via column menu', () => {
    render(
      <HoldingsTable
        positions={mockPositions}
        soldAssets={mockSoldAssets}
        netWorth={netWorth}
        currency="EUR"
      />
    );

    const menuBtn = screen.getByLabelText('Toggle table columns');
    fireEvent.click(menuBtn);

    expect(screen.getByLabelText('Position')).toBeInTheDocument();
    expect(screen.getByLabelText('Net cash invested')).toBeInTheDocument();

    // Uncheck Position column
    const posCheckbox = screen.getByLabelText('Position');
    fireEvent.click(posCheckbox);

    // Position column header should be hidden
    expect(screen.queryByRole('columnheader', { name: /Position/i })).not.toBeInTheDocument();
  });

  it('should toggle displaying closed positions with Closed badge', () => {
    render(
      <HoldingsTable
        positions={mockPositions}
        soldAssets={mockSoldAssets}
        netWorth={netWorth}
        currency="EUR"
      />
    );

    // Initially SAN.MC is not visible
    expect(screen.queryByText('SAN.MC')).not.toBeInTheDocument();

    const toggleClosedBtn = screen.getByText('See both open and closed positions');
    fireEvent.click(toggleClosedBtn);

    // Now SAN.MC is visible with Closed badge
    expect(screen.getAllByText('SAN.MC').length).toBeGreaterThan(0);
    expect(screen.getByText('Closed')).toBeInTheDocument();

    // Button text toggled
    expect(screen.getByText('Show open positions only')).toBeInTheDocument();
  });

  it('should render clean empty state when there are 0 positions in the portfolio', () => {
    render(
      <HoldingsTable
        positions={[]}
        soldAssets={[]}
        netWorth={0}
        currency="EUR"
      />
    );

    expect(screen.getByText(/No holdings in portfolio yet/i)).toBeInTheDocument();
  });
});
