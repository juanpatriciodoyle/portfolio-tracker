import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionHistoryTable, { type TransactionLog } from '../TransactionHistoryTable';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn() }));
import { authorizedFetch } from '../../lib/authorizedFetch';

const makeTx = (n: number): TransactionLog => ({
  id: `t${n}`,
  type: 'BOUGHT',
  symbol: `SYM${n}`,
  assetClass: 'Stock',
  region: 'Europe',
  sector: 'Tech',
  amount: n,
  fee: 0,
  totalAmount: n,
  currency: 'EUR',
  date: new Date(Date.UTC(2024, 0, n)).toISOString(),
});

const respondWith = (count: number) =>
  vi.mocked(authorizedFetch).mockResolvedValue({
    ok: true,
    json: async () => Array.from({ length: count }, (_, i) => makeTx(i + 1)),
  } as Response);

describe('TransactionHistoryTable pagination', () => {
  beforeEach(() => vi.mocked(authorizedFetch).mockReset());

  it('shows only the 5 latest operations first, newest on top', async () => {
    respondWith(12);
    render(<TransactionHistoryTable userId="u" />);
    await screen.findByText('SYM12');
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5
    expect(screen.getByText('SYM8')).toBeInTheDocument();
    expect(screen.queryByText('SYM7')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('pages back through older operations and disables Next on the last page', async () => {
    respondWith(12);
    render(<TransactionHistoryTable userId="u" />);
    await screen.findByText('SYM12');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('SYM7')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('hides the pagination when everything fits one page', async () => {
    respondWith(3);
    render(<TransactionHistoryTable userId="u" />);
    await screen.findByText('SYM3');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('returns to the first page when the search changes', async () => {
    respondWith(12);
    render(<TransactionHistoryTable userId="u" />);
    await screen.findByText('SYM12');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByPlaceholderText(/search symbol/i), { target: { value: 'europe' } });
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
  });
});
