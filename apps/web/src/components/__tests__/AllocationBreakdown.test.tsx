import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import AllocationBreakdown from '../AllocationBreakdown';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { setActiveLocale } from '../../i18n/activeLocale';
import { type PositionItem } from '../HoldingsTable';

describe('AllocationBreakdown Component', () => {
  afterEach(() => setActiveLocale(null));

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

  const renderPanel = (over: Partial<React.ComponentProps<typeof AllocationBreakdown>> = {}) =>
    render(
      <AllocationBreakdown
        breakdowns={mockBreakdowns}
        positions={mockPositions}
        cashBalance={10000}
        netWorth={200000}
        currency="EUR"
        {...over}
      />
    );
  const explore = () => fireEvent.click(screen.getByRole('button', { name: 'Explore' }));

  it('opens on one plain sentence and one bar, not on four tabs', () => {
    renderPanel();
    expect(screen.getByText('Allocation')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'What you own, by sector' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('says in plain words what is worth knowing, and that it is not a problem by itself', () => {
    renderPanel();
    // Apple is 100000 of the 200000 owned, cash included: the share the table shows. The fund is spread out by design and is never named.
    expect(screen.getByText('Apple Inc. alone is 50% of what you own.')).toBeInTheDocument();
    expect(screen.getByText('Technology is 50% of what you own.')).toBeInTheDocument();
    expect(screen.getByText('Worth knowing, not a problem by itself.')).toBeInTheDocument();
    expect(screen.queryByText(/Vanguard.*alone/)).not.toBeInTheDocument();
  });

  it('says it in Argentine Spanish, never as advice', () => {
    render(
      <LocaleProvider initial="es-AR">
        <AllocationBreakdown breakdowns={mockBreakdowns} positions={mockPositions} cashBalance={10000} netWorth={200000} currency="EUR" />
      </LocaleProvider>
    );
    expect(screen.getByText('Tecnología es el 50% de lo que tenés.')).toBeInTheDocument();
    expect(screen.getByText('Es bueno saberlo, no es un problema en sí mismo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explorar' })).toBeInTheDocument();
  });

  it('names the sectors in the bar in plain words, never "Diversified"', () => {
    renderPanel();
    expect(screen.getByText(/Many industries 45%/)).toBeInTheDocument();
    expect(screen.queryByText(/Diversified/)).not.toBeInTheDocument();
    expect(screen.getByText(/Technology 50%/)).toBeInTheDocument();
    // The cash is a part of what is owned too, so the parts add up to the whole.
    expect(screen.getByText(/Cash 5%/)).toBeInTheDocument();
  });

  it('says nothing about concentration with a single holding', () => {
    renderPanel({ positions: [mockPositions[0]] });
    expect(screen.queryByText(/of what you own\./)).not.toBeInTheDocument();
    expect(screen.queryByText('Worth knowing, not a problem by itself.')).not.toBeInTheDocument();
    // The bar is still there.
    expect(screen.getByRole('img', { name: 'What you own, by sector' })).toBeInTheDocument();
  });

  it('says nothing when nothing is concentrated', () => {
    const spread: PositionItem[] = ['Technology', 'Financials', 'Energy', 'Healthcare', 'Utilities', 'Consumer'].map((sector, i) => ({
      id: `p${i}`,
      symbol: `S${i}`,
      name: `Company ${i}`,
      assetClass: 'Stock',
      region: 'Europe',
      sector,
      quantity: 1,
      investedAmount: 100,
      currentValue: 100,
    }));
    renderPanel({ positions: spread });
    expect(screen.queryByText(/of what you own\./)).not.toBeInTheDocument();
  });

  it('keeps the four views one tap away under Explore', () => {
    renderPanel();
    explore();
    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Sectors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Regions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Asset classes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Holdings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('should render items for the default Sectors view once explored', () => {
    renderPanel();
    explore();
    const explorer = document.querySelector('.allocation-explorer') as HTMLElement;
    expect(within(explorer).getByText('Technology')).toBeInTheDocument();
    expect(within(explorer).getByText('Financials')).toBeInTheDocument();
    expect(within(explorer).getByText('60.0%')).toBeInTheDocument();
    expect(within(explorer).getByText('40.0%')).toBeInTheDocument();
  });

  it('should switch between views and display corresponding items', () => {
    renderPanel();
    explore();

    fireEvent.click(screen.getByRole('tab', { name: 'Regions' }));
    expect(screen.getByText('North America')).toBeInTheDocument();
    expect(screen.getByText('Europe')).toBeInTheDocument();

    // The one list of asset classes: what older holdings called Equity or Fixed Income reads as Stock and Bond.
    fireEvent.click(screen.getByRole('tab', { name: 'Asset classes' }));
    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('Bond')).toBeInTheDocument();
    expect(screen.queryByText('Equity')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Vanguard S&P 500 UCITS ETF')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('should update center overlay on hovering over a legend item', () => {
    renderPanel();
    explore();

    const techItem = screen.getAllByText('Technology').find((node) => node.closest('.dashboard-allocation__legend-item'))!.closest('.dashboard-allocation__legend-item')!;
    fireEvent.mouseEnter(techItem);

    // Center overlay displays hovered item name and percentage
    expect(screen.getAllByText('Technology').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('60.0%').length).toBeGreaterThanOrEqual(2);

    fireEvent.mouseLeave(techItem);
  });

  it('should render empty state when no breakdown data exists', () => {
    renderPanel({ breakdowns: { sectors: [], regions: [], assetClasses: [] }, positions: [], cashBalance: 0, netWorth: 0 });
    expect(screen.getByText(/No allocation data recorded yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explore' })).not.toBeInTheDocument();
  });
});
