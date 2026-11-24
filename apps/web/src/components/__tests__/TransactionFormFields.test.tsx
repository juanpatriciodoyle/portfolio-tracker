import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as http from '../../lib/authorizedFetch';
import TransactionForm from '../TransactionForm';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn(), readAuthToken: vi.fn() }));

const authorizedFetch = http.authorizedFetch as unknown as Mock<(path: string, init?: RequestInit) => Promise<Response>>;
const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body } as Response);
const posted = () => JSON.parse(String(authorizedFetch.mock.calls[0][1]?.body));

const search = (results: unknown[]) => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => results });
};

beforeEach(() => {
  vi.restoreAllMocks();
  authorizedFetch.mockReset();
  search([]);
});

describe('TransactionForm: plain labels, tied to their fields', () => {
  it('says what each amount is without a currency in brackets', () => {
    render(<TransactionForm />);

    expect(screen.getByLabelText('Total amount paid')).toBeInTheDocument();
    expect(screen.getByLabelText('Transaction date')).toBeInTheDocument();
    expect(screen.getByLabelText('Broker fee')).toBeInTheDocument();
    expect(screen.getByLabelText('Stock, fund or crypto')).toBeInTheDocument();
  });

  it('puts the typing hint inside the search box, not in its label', () => {
    render(<TransactionForm />);

    expect(screen.getByPlaceholderText(/Type 3\+ letters/)).toBeInTheDocument();
    expect(screen.queryByText(/Type 3\+ letters \)/)).not.toBeInTheDocument();
  });

  it('calls what comes back from a sale "Total amount received"', () => {
    render(<TransactionForm />);
    fireEvent.click(screen.getByRole('button', { name: /Sell/ }));

    expect(screen.queryByLabelText('Total amount paid')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Total amount received')).toBeInTheDocument();
  });
});

describe('TransactionForm: crypto is an asset class, never a sector', () => {
  it('offers no sector once crypto is the class', () => {
    render(<TransactionForm />);
    expect(screen.getByLabelText('Sector')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Asset Class'), { target: { value: 'Crypto' } });

    expect(screen.queryByLabelText('Sector')).not.toBeInTheDocument();
  });

  it('never lists Crypto among the sectors', () => {
    render(<TransactionForm />);

    const options = [...screen.getByLabelText('Sector').querySelectorAll('option')].map((option) => option.value);
    expect(options).not.toContain('Crypto');
  });

  it('takes a search result that names crypto as its sector as a crypto holding with no sector', async () => {
    authorizedFetch.mockImplementation(() => answer({ success: true }));
    search([{ symbol: 'BTC-USD', name: 'Bitcoin', assetClass: 'Cryptocurrency', sector: 'Crypto' }]);
    render(<TransactionForm />);

    fireEvent.change(screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i), { target: { value: 'BTC' } });
    fireEvent.click(await screen.findByText('BTC-USD'));
    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '500' } });

    expect(screen.getByLabelText('Asset Class')).toHaveValue('Crypto');
    expect(screen.queryByLabelText('Sector')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ assetClass: 'Crypto' });
    expect(posted().sector).toBeUndefined();
  });
});

describe('TransactionForm: the person\'s own currency', () => {
  it('records the transaction in the currency it was given', async () => {
    authorizedFetch.mockImplementation(() => answer({ success: true }));
    render(<TransactionForm currency="USD" />);

    fireEvent.change(screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    expect(posted().currency).toBe('USD');
  });

  it('keeps euros when nothing else is said', async () => {
    authorizedFetch.mockImplementation(() => answer({ success: true }));
    render(<TransactionForm />);

    fireEvent.change(screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    expect(posted().currency).toBe('EUR');
  });
});

describe('TransactionForm: Escape closes the list before it closes the dialog', () => {
  it('keeps the press away from the dialog while the suggestions are open', async () => {
    search([{ symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', sector: 'Technology' }]);
    render(<TransactionForm />);
    const box = screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i);

    fireEvent.change(box, { target: { value: 'AAP' } });
    await screen.findByText('Apple Inc.');

    const stopped = !fireEvent.keyDown(box, { key: 'Escape' });

    expect(stopped).toBe(true);
    expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();
  });

  it('lets the press through when there is no list to close', () => {
    render(<TransactionForm />);
    const box = screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i);

    expect(fireEvent.keyDown(box, { key: 'Escape' })).toBe(true);
  });
});
