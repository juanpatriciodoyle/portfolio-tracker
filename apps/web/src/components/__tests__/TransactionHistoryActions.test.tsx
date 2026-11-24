import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionHistoryTable, { type TransactionLog } from '../TransactionHistoryTable';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn() }));
import { authorizedFetch } from '../../lib/authorizedFetch';

const row = (n: number, extra: Partial<TransactionLog> = {}): TransactionLog => ({
  id: `t${n}`,
  type: 'BOUGHT',
  symbol: `SYM${n}`,
  name: `Company ${n}`,
  assetClass: 'Stock',
  region: 'Europe',
  sector: 'Technology',
  quantity: 10,
  amount: 1800,
  fee: 2,
  totalAmount: 1802,
  currency: 'EUR',
  date: new Date(Date.UTC(2024, 0, n)).toISOString(),
  paidWithCash: false,
  ...extra,
});

let rows: TransactionLog[] = [];
type Handler = (path: string, init?: RequestInit) => Promise<Response> | undefined;
let handler: Handler = () => undefined;
const reply = (status: number, body?: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

beforeEach(() => {
  rows = [row(1), row(2), row(3)];
  handler = () => undefined;
  vi.mocked(authorizedFetch).mockReset();
  vi.mocked(authorizedFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const custom = handler(path, init);
    if (custom) return custom;
    if (init?.method === 'DELETE') {
      rows = rows.filter((candidate) => `/api/transactions/${candidate.id}` !== path);
      return reply(204);
    }
    if (init?.method === 'PATCH') return reply(204);
    return reply(200, rows);
  });
});

afterEach(() => vi.useRealTimers());

const calls = (method: string) => vi.mocked(authorizedFetch).mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);
const open = async (id: number) => {
  const trigger = await screen.findByRole('button', { name: `Delete Buy SYM${id}, Jan ${id}, 2024` });
  fireEvent.click(trigger);
  return trigger;
};

describe('each transaction can be corrected or removed from the history', () => {
  it('gives every row an Edit and a Delete button that say which transaction they are for', async () => {
    render(<TransactionHistoryTable userId="u" />);

    for (const n of [1, 2, 3]) {
      expect(await screen.findByRole('button', { name: `Edit Buy SYM${n}, Jan ${n}, 2024` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Delete Buy SYM${n}, Jan ${n}, 2024` })).toBeInTheDocument();
    }
  });

  it('shows the same buttons on the phone layout', async () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia;
    render(<TransactionHistoryTable userId="u" />);

    expect(await screen.findByRole('button', { name: 'Edit Buy SYM2, Jan 2, 2024' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Buy SYM2, Jan 2, 2024' })).toBeInTheDocument();
  });
});

describe('removing a transaction', () => {
  it('asks once, in words, what it removes and what is recalculated, and removes nothing yet', async () => {
    render(<TransactionHistoryTable userId="u" />);

    await open(2);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this transaction?' });
    expect(within(dialog).getByText('This removes the purchase of 10 Company 2 on Jan 2, 2024. Your holdings and profit will be recalculated.')).toBeInTheDocument();
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('removes it on Delete, then reloads the list, tells the home to refresh and says it is done', async () => {
    const onChanged = vi.fn();
    render(<TransactionHistoryTable userId="u" onChanged={onChanged} />);
    await open(2);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls('DELETE').map(([path]) => path)).toEqual(['/api/transactions/t2']);
    await waitFor(() => expect(screen.queryByText('SYM2')).not.toBeInTheDocument());
    expect(screen.getByText('SYM1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Transaction deleted.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('removes it once however many times the button is pressed', async () => {
    let finish: (response: Response) => void = () => undefined;
    handler = (_path, init) => (init?.method === 'DELETE' ? new Promise<Response>((resolve) => (finish = resolve)) : undefined);
    render(<TransactionHistoryTable userId="u" />);
    await open(1);
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(calls('DELETE')).toHaveLength(1);
    await act(async () => finish({ ok: true, status: 204, json: async () => undefined } as Response));
  });

  it('keeps everything when the person cancels, and gives the focus back to the button', async () => {
    const onChanged = vi.fn();
    render(<TransactionHistoryTable userId="u" onChanged={onChanged} />);
    const trigger = await open(3);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls('DELETE')).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape', async () => {
    render(<TransactionHistoryTable userId="u" />);
    await open(1);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('starts on the safe answer: Cancel has the focus', async () => {
    render(<TransactionHistoryTable userId="u" />);
    await open(1);

    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('says which later transaction depends on it when the change is refused, and stays open', async () => {
    handler = (_path, init) =>
      init?.method === 'DELETE'
        ? reply(409, { error: 'x', code: 'TRANSACTION_REQUIRED_BY_LATER', dependent: { id: 't9', type: 'SOLD', symbol: 'SYM1', date: '2024-02-01' } })
        : undefined;
    const onChanged = vi.fn();
    render(<TransactionHistoryTable userId="u" onChanged={onChanged} />);
    await open(1);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/a later transaction depends on it \(sale of SYM1, Feb 1, 2024\)/)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('says so and reloads the list when the transaction is already gone', async () => {
    handler = (_path, init) => (init?.method === 'DELETE' ? reply(404, { error: 'Transaction not found' }) : undefined);
    render(<TransactionHistoryTable userId="u" />);
    await open(1);
    const gets = () => calls('GET').length;
    const before = gets();

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This transaction no longer exists. The list has been refreshed.'));
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
  });

  it('says it when the server cannot be reached, and removes nothing', async () => {
    handler = (_path, init) => (init?.method === 'DELETE' ? Promise.reject(new Error('offline')) : undefined);
    render(<TransactionHistoryTable userId="u" />);
    await open(1);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Could not reach the server, so nothing changed/)).toBeInTheDocument();
  });
});

describe('correcting a transaction', () => {
  it('opens the same form on that transaction, saves only the change, then closes and refreshes', async () => {
    const onChanged = vi.fn();
    render(<TransactionHistoryTable userId="u" onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Buy SYM2, Jan 2, 2024' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByLabelText('Total amount paid')).toHaveValue(1800);
    fireEvent.change(within(dialog).getByLabelText('Total amount paid'), { target: { value: '1900' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls('PATCH')).toHaveLength(1);
    expect(calls('PATCH')[0][0]).toBe('/api/transactions/t2');
    expect(JSON.parse(String(calls('PATCH')[0][1]?.body))).toEqual({ amount: 1900 });
    expect(screen.queryByRole('dialog', { name: 'Edit transaction' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Transaction updated.');
  });

  it('offers paying with cash on a purchase only with the cash that is there, counting the cash this purchase already used', async () => {
    rows = [row(1, { paidWithCash: true, amount: 1000, fee: 0 })];
    render(<TransactionHistoryTable userId="u" cashBalances={[{ currency: 'EUR', balance: 250 }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Buy SYM1, Jan 1, 2024' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByRole('checkbox', { name: /Pay with cash/ })).toBeChecked();
    // The 250 still in the account plus the 1,000 this purchase took out.
    expect(within(dialog).getByText('Available: €1,250')).toBeInTheDocument();
  });
});
