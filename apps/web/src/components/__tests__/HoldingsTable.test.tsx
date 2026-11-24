import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { setActiveLocale } from '../../i18n/activeLocale';
import { createMemoryStorage } from '../../test/memoryStorage';
import HoldingsTable, { type PositionItem, type SoldAssetItem } from '../HoldingsTable';

/** Makes the browser report a narrow (or wide) screen to every media query. */
function setNarrowScreen(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  setNarrowScreen(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveLocale(null);
});

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
const chooseColumn = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name }));
const headerNames = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

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
    holdingDays: 800,
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
const renderTable = () => render(<HoldingsTable positions={mockPositions} soldAssets={mockSoldAssets} netWorth={netWorth} currency="EUR" />);

describe('HoldingsTable: the default view', () => {
  it('shows four columns: name, value, profit and share of the portfolio', () => {
    renderTable();
    expect(screen.getByText('Holdings')).toBeInTheDocument();
    expect(headerNames()).toEqual(['Name', 'Value', 'Profit', 'Share of portfolio']);
  });

  it('shows each holding once, with its value, its profit in money and percent, and its share', () => {
    renderTable();
    const apple = screen.getByText('Apple Inc.').closest('tr') as HTMLElement;
    expect(within(apple).getByText('AAPL')).toBeInTheDocument();
    expect(within(apple).getByText(/2,200/)).toBeInTheDocument();
    expect(within(apple).getByText(/\+€400/)).toBeInTheDocument();
    expect(within(apple).getByText('+22.22%')).toBeInTheDocument();
    expect(within(apple).getByText('6.3%')).toBeInTheDocument();

    const bitcoin = screen.getByText('Bitcoin').closest('tr') as HTMLElement;
    expect(within(bitcoin).getByText(/32,500/)).toBeInTheDocument();
  });

  it('keeps the older, jargon-heavy headings out of it', () => {
    renderTable();
    for (const old of ['Position', 'Holding period', 'Net cash invested', 'Holding return (MWR)', 'Net profit/loss', 'Allocation %']) {
      expect(screen.queryByText(old)).not.toBeInTheDocument();
    }
  });

  it('draws no bar beside the name: the share is said once, in its own column', () => {
    const { container } = renderTable();
    expect(container.querySelector('.dashboard-table-bar')).toBeNull();
  });

  it('renders a clean empty state when there are no holdings', () => {
    render(<HoldingsTable positions={[]} soldAssets={[]} netWorth={0} currency="EUR" />);
    expect(screen.getByText(/No holdings in portfolio yet/i)).toBeInTheDocument();
  });
});

describe('HoldingsTable: customize columns', () => {
  it('lists every column with the four shown ticked', () => {
    renderTable();
    openMenu();
    for (const name of ['Value', 'Profit', 'Share of portfolio']) expect(screen.getByRole('checkbox', { name })).toBeChecked();
    for (const name of ['Units', 'Held', 'What you paid', 'Paid per share', 'Price per share', 'Yearly return']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
  });

  it('adds a column when it is ticked, with one heading and no sub-heading', () => {
    renderTable();
    openMenu();
    chooseColumn('Units');
    chooseColumn('Held');
    chooseColumn('What you paid');
    expect(headerNames()).toEqual(['Name', 'Value', 'Profit', 'Share of portfolio', 'Units', 'Held', 'What you paid']);

    const apple = screen.getByText('Apple Inc.').closest('tr') as HTMLElement;
    expect(within(apple).getByText('10')).toBeInTheDocument();
    expect(within(apple).getByText('4 months')).toBeInTheDocument();
    expect(within(apple).getByText(/1,800/)).toBeInTheDocument();
  });

  it('writes the time held in the unit that reads best: months under a year, years after', () => {
    renderTable();
    openMenu();
    chooseColumn('Held');
    expect(screen.getByText('4 months')).toBeInTheDocument();
    // 800 days is more than two years.
    expect(screen.getByText('2.2 years')).toBeInTheDocument();
  });

  it('hides a column again, and the table keeps the rest', () => {
    renderTable();
    openMenu();
    chooseColumn('Profit');
    expect(headerNames()).toEqual(['Name', 'Value', 'Share of portfolio']);
  });

  it('remembers the choice for the next visit', () => {
    const first = renderTable();
    openMenu();
    chooseColumn('Units');
    first.unmount();

    renderTable();
    expect(headerNames()).toContain('Units');
  });

  it('starts from the defaults when what was saved was made for the earlier table', () => {
    localStorage.setItem('holdings.columns', JSON.stringify({ position: false, netCash: true, value: false, return: false }));
    renderTable();
    expect(headerNames()).toEqual(['Name', 'Value', 'Profit', 'Share of portfolio']);
  });

  it('starts from the defaults when what was saved is garbage', () => {
    localStorage.setItem('holdings.columns', '{{{');
    renderTable();
    expect(headerNames()).toEqual(['Name', 'Value', 'Profit', 'Share of portfolio']);
  });
});

describe('HoldingsTable: yearly return', () => {
  it('shows nothing before a year is held, and the yearly figure after', () => {
    renderTable();
    openMenu();
    chooseColumn('Yearly return');
    const cells = (name: string) => within(screen.getByText(name).closest('tr') as HTMLElement).getAllByRole('cell');

    // 120 days: no yearly figure, the total percent under Profit stands.
    expect(cells('Apple Inc.')[4]).toHaveTextContent('');
    // 800 days: a yearly figure, smaller than the +8.33% total.
    expect(cells('Bitcoin')[4].textContent).toMatch(/^\+3\.\d\d%$/);
  });
});

describe('HoldingsTable: sold holdings', () => {
  it('shows a sold holding once, as Sold, and not under its own ticker twice', () => {
    renderTable();
    expect(screen.queryByText('SAN.MC')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show what you hold and what you sold'));
    expect(screen.getAllByText('SAN.MC')).toHaveLength(1);
    expect(screen.getByText('Sold')).toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    expect(screen.getByText('Show only what you still hold')).toBeInTheDocument();
  });
});

describe('HoldingsTable: sorting', () => {
  it('sorts by a heading, again to reverse it, and says so to assistive technology', () => {
    renderTable();
    const nameHeading = screen.getByRole('columnheader', { name: /Name/ });
    // The table starts with the biggest share first.
    expect(screen.getByRole('columnheader', { name: /Share of portfolio/ })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(within(nameHeading).getByRole('button'));
    expect(nameHeading).toHaveAttribute('aria-sort', 'ascending');
    let rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Apple Inc.');
    expect(rows[2]).toHaveTextContent('Bitcoin');

    fireEvent.click(within(nameHeading).getByRole('button'));
    expect(nameHeading).toHaveAttribute('aria-sort', 'descending');
    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Bitcoin');
    expect(rows[2]).toHaveTextContent('Apple Inc.');
  });

  it('is reachable with the keyboard: every heading is a real button', () => {
    renderTable();
    for (const heading of screen.getAllByRole('columnheader')) expect(within(heading).getAllByRole('button').length).toBeGreaterThanOrEqual(1);
  });
});

describe('HoldingsTable: the "?" explanations', () => {
  it('explains Profit in one plain sentence, in a popover that Esc closes', () => {
    renderTable();
    const help = screen.getByRole('button', { name: 'About Profit' });
    expect(help).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    const popover = screen.getByRole('dialog', { name: 'Profit' });
    expect(popover).toHaveTextContent('What this holding has earned or lost compared with what you paid for it.');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(help).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a click elsewhere, and on its own close button', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'About Profit' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'About Profit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('floats above the table instead of inside its scrolling area', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'About Profit' }));
    const popover = screen.getByRole('dialog', { name: 'Profit' });
    expect(popover.closest('table')).toBeNull();
    expect(popover.parentElement).toBe(document.body);
  });

  it('has an explanation for the words that need one: Profit, What you paid and Yearly return', () => {
    renderTable();
    openMenu();
    chooseColumn('What you paid');
    chooseColumn('Yearly return');
    for (const term of ['Profit', 'What you paid', 'Yearly return']) {
      fireEvent.click(screen.getByRole('button', { name: `About ${term}` }));
      expect(screen.getByRole('dialog', { name: term })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
    }
  });
});

describe('HoldingsTable: asset classes', () => {
  it('lists one asset class for what older holdings called Equity', () => {
    const positions: PositionItem[] = [
      { ...mockPositions[0], id: 'a', assetClass: 'Stock' },
      { ...mockPositions[0], id: 'b', symbol: 'MSFT', name: 'Microsoft', assetClass: 'Equity' },
      { ...mockPositions[1], id: 'c', assetClass: 'Cryptocurrency' },
    ];
    render(<HoldingsTable positions={positions} soldAssets={[]} netWorth={netWorth} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter holdings' }));
    expect(screen.getAllByRole('checkbox', { name: 'Stock' })).toHaveLength(1);
    expect(screen.getAllByRole('checkbox', { name: 'Crypto' })).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'Equity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Cryptocurrency' })).not.toBeInTheDocument();
  });

  it('never offers Crypto as a sector', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Filter holdings' }));
    const sectors = screen.getByText('Sector').closest('fieldset') as HTMLElement;
    expect(within(sectors).queryByRole('checkbox', { name: /Crypto/ })).not.toBeInTheDocument();
    expect(within(sectors).getByRole('checkbox', { name: 'Technology' })).toBeInTheDocument();
  });
});

describe('HoldingsTable: cards on a narrow screen', () => {
  beforeEach(() => setNarrowScreen(true));

  it('shows one card per holding instead of a table, with value, profit and share', () => {
    renderTable();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Your holdings' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);

    const apple = cards.find((card) => card.textContent?.includes('Apple Inc.')) as HTMLElement;
    expect(within(apple).getByText(/2,200/)).toBeInTheDocument();
    expect(apple).toHaveTextContent('+22.22%');
    expect(within(apple).getByRole('img', { name: 'Share of portfolio: 6.3%' })).toBeInTheDocument();
  });

  it('keeps the rest one tap away, and out of the way until then', () => {
    renderTable();
    const card = screen.getByText('Apple Inc.').closest('li') as HTMLElement;
    const summary = within(card).getByRole('button');
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText('Units')).not.toBeInTheDocument();

    fireEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText('Units')).toBeInTheDocument();
    expect(within(card).getByText('4 months')).toBeInTheDocument();
    expect(within(card).getByText('What you paid')).toBeInTheDocument();
    // A year has not passed: there is no yearly figure to list.
    expect(within(card).queryByText('Yearly return')).not.toBeInTheDocument();
  });

  it('lists a yearly return once a year has passed', () => {
    renderTable();
    const card = screen.getByText('Bitcoin').closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button'));
    expect(within(card).getByText('Yearly return')).toBeInTheDocument();
  });

  it('has no column menu (the cards show a fixed set) but keeps search and filter', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: 'Customize columns' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search holdings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter holdings' })).toBeInTheDocument();
  });

  it('shows a sold holding as a card marked Sold', () => {
    renderTable();
    fireEvent.click(screen.getByText('Show what you hold and what you sold'));
    const card = screen.getByText('SAN.MC').closest('li') as HTMLElement;
    expect(within(card).getByText('Sold')).toBeInTheDocument();
  });

  it('says so when a search finds nothing', () => {
    renderTable();
    fireEvent.change(screen.getByRole('searchbox', { name: /search holdings/i }), { target: { value: 'zzz' } });
    expect(screen.getByText(/No holdings match/i)).toBeInTheDocument();
  });
});

describe('HoldingsTable in Argentine Spanish', () => {
  const renderSpanish = () =>
    render(
      <LocaleProvider initial="es-AR">
        <HoldingsTable positions={mockPositions} soldAssets={mockSoldAssets} netWorth={netWorth} currency="EUR" />
      </LocaleProvider>
    );

  it('names the four columns in Spanish and keeps one heading per column', () => {
    renderSpanish();
    expect(headerNames().map((name) => name?.trim())).toEqual(['Nombre', 'Valor', 'Ganancia', 'Parte del portfolio']);
  });

  it('writes time held and percentages the Argentine way', () => {
    renderSpanish();
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar columnas' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tiempo de tenencia' }));
    expect(screen.getByText('4 meses')).toBeInTheDocument();
    expect(screen.getByText('2,2 años')).toBeInTheDocument();
    expect(screen.getByText('+22,22%')).toBeInTheDocument();
  });

  it('explains Profit in Spanish', () => {
    renderSpanish();
    fireEvent.click(screen.getByRole('button', { name: 'Sobre Ganancia' }));
    expect(screen.getByRole('dialog', { name: 'Ganancia' })).toHaveTextContent('Lo que esta tenencia ganó o perdió frente a lo que pagaste por ella.');
  });
});

describe('HoldingsTable omnibox search', () => {
  const positions: PositionItem[] = [
    { id: 'a', symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', region: 'North America', sector: 'Technology', quantity: 1, investedAmount: 100, currentValue: 120 },
    { id: 'b', symbol: 'SAN.MC', name: 'Banco Santander', assetClass: 'Stock', region: 'Europe', sector: 'Financials', quantity: 1, investedAmount: 100, currentValue: 110 },
  ];
  const renderSearchTable = () => render(<HoldingsTable positions={positions} soldAssets={[]} netWorth={230} />);
  const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: /search holdings/i }), { target: { value } });

  it('filters by ticker, name and sector with one input', () => {
    renderSearchTable();
    search('aapl');
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.queryByText('Banco Santander')).not.toBeInTheDocument();

    search('santander');
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();
    expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();

    search('financ');
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();
    expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();
  });

  it('shows a no-match message and restores all rows when cleared', () => {
    renderSearchTable();
    search('zzz');
    expect(screen.getByText(/No holdings match/i)).toBeInTheDocument();
    search('');
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();
  });
});

describe('HoldingsTable toolbar', () => {
  const positions: PositionItem[] = [
    { id: 'a', symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', region: 'North America', sector: 'Technology', quantity: 1, investedAmount: 100, currentValue: 120 },
    { id: 'b', symbol: 'SAN.MC', name: 'Banco Santander', assetClass: 'Stock', region: 'Europe', sector: 'Financials', quantity: 1, investedAmount: 100, currentValue: 110 },
  ];

  it('puts search, filter and columns on one row, with a tooltip on the columns button', () => {
    render(<HoldingsTable positions={positions} soldAssets={[]} netWorth={230} />);
    const toolbar = screen.getByRole('searchbox', { name: /search holdings/i }).closest('.holdings-toolbar') as HTMLElement;
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Filter holdings' }));
    expect(screen.getByRole('button', { name: 'Customize columns' })).toHaveAttribute('title', 'Customize columns');
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Customize columns' }));
  });

  it('closes the columns menu with Esc', () => {
    render(<HoldingsTable positions={positions} soldAssets={[]} netWorth={230} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
    expect(screen.getByRole('group', { name: 'Customize columns' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Customize columns' })).not.toBeInTheDocument();
  });

  it('filters the table by region and offers a way back', () => {
    render(<HoldingsTable positions={positions} soldAssets={[]} netWorth={230} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter holdings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Europe' }));
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();
    expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();

    // The other options stay on offer while a filter is on.
    expect(screen.getByRole('checkbox', { name: 'North America' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });
});
