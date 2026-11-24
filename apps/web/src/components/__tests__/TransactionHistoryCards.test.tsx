import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionHistoryTable, { type TransactionLog } from '../TransactionHistoryTable';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn() }));
import { authorizedFetch } from '../../lib/authorizedFetch';

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

const tx = (overrides: Partial<TransactionLog>): TransactionLog => ({
  id: 't1',
  type: 'BOUGHT',
  symbol: 'AAPL',
  assetClass: 'Stock',
  region: 'North America',
  sector: 'Technology',
  amount: 1800,
  fee: 0,
  totalAmount: 1800,
  currency: 'EUR',
  date: '2026-03-12T10:00:00.000Z',
  ...overrides,
});

const respondWith = (rows: TransactionLog[]) => vi.mocked(authorizedFetch).mockResolvedValue({ ok: true, json: async () => rows } as Response);

beforeEach(() => vi.mocked(authorizedFetch).mockReset());
afterEach(() => setNarrowScreen(false));

describe('TransactionHistoryTable on a narrow screen', () => {
  beforeEach(() => setNarrowScreen(true));

  it('shows each transaction as a card with the amount in view, not a table to scroll sideways', async () => {
    respondWith([tx({}), tx({ id: 't2', symbol: 'NVDA', type: 'SOLD', amount: 950 })]);
    render(<TransactionHistoryTable userId="u" />);

    const cards = await screen.findAllByRole('listitem');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('AAPL')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Buy')).toBeInTheDocument();
    expect(within(cards[0]).getByText('€1,800.00')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Mar 12, 2026/)).toBeInTheDocument();
  });

  it('adds the fee only when there was one', async () => {
    respondWith([tx({ fee: 2.5 }), tx({ id: 't2', symbol: 'NVDA', fee: 0, date: '2026-03-01T10:00:00.000Z' })]);
    render(<TransactionHistoryTable userId="u" />);

    const [withFee, withoutFee] = await screen.findAllByRole('listitem');

    expect(within(withFee).getByText(/Fee/)).toHaveTextContent('€2.50');
    expect(within(withoutFee).queryByText(/Fee/)).not.toBeInTheDocument();
  });

  it('keeps the search and the filter working on the cards', async () => {
    respondWith([tx({}), tx({ id: 't2', symbol: 'NVDA' })]);
    render(<TransactionHistoryTable userId="u" />);
    await screen.findAllByRole('listitem');

    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'nvda' } });

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('NVDA')).toBeInTheDocument();
  });
});

describe('TransactionHistoryTable on a wide screen', () => {
  beforeEach(() => setNarrowScreen(false));

  it('keeps the table', async () => {
    respondWith([tx({})]);
    render(<TransactionHistoryTable userId="u" />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('TransactionHistoryTable amounts', () => {
  it('writes each amount in the currency it was recorded in', async () => {
    respondWith([tx({ currency: 'USD', amount: 1000, fee: 3 })]);
    render(<TransactionHistoryTable userId="u" />);

    expect(await screen.findByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
  });
});
