import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as http from '../../lib/authorizedFetch';
import TransactionForm from '../TransactionForm';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn(), readAuthToken: vi.fn() }));

const authorizedFetch = http.authorizedFetch as unknown as Mock<(path: string, init?: RequestInit) => Promise<Response>>;

const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body } as Response);

/** The body the form posted, parsed. */
const posted = () => JSON.parse(String(authorizedFetch.mock.calls[0][1]?.body));

function fillBuy() {
  fireEvent.change(screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i), { target: { value: 'AAPL' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. 1500.00'), { target: { value: '1800' } });
}

beforeEach(() => {
  vi.restoreAllMocks();
  authorizedFetch.mockReset();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

describe('TransactionForm: paying with cash', () => {
  it('offers it on a buy, unticked: a buy brings new money unless the person says otherwise', () => {
    render(<TransactionForm cashAvailable={5000} />);

    const box = screen.getByRole('checkbox', { name: /Pay with cash/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText('Use the cash you already hold instead of adding new money.')).toBeInTheDocument();
  });

  it('is not offered when there is no cash to pay with, and says how much there is when there is', () => {
    const { rerender } = render(<TransactionForm />);
    expect(screen.queryByRole('checkbox', { name: /Pay with cash/ })).not.toBeInTheDocument();

    rerender(<TransactionForm cashAvailable={0} />);
    expect(screen.queryByRole('checkbox', { name: /Pay with cash/ })).not.toBeInTheDocument();

    rerender(<TransactionForm cashAvailable={2500} />);
    expect(screen.getByRole('checkbox', { name: /Pay with cash/ })).toBeInTheDocument();
    expect(screen.getByText('Available: €2,500')).toBeInTheDocument();
  });

  it('is not offered on a sale, a deposit or a withdrawal', () => {
    render(<TransactionForm cashAvailable={5000} />);

    for (const tab of [/Sell/, /Deposit/, /Withdraw/]) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(screen.queryByRole('checkbox', { name: /Pay with cash/ })).not.toBeInTheDocument();
    }
  });

  it('names the transaction types as verbs', () => {
    render(<TransactionForm cashAvailable={5000} />);

    expect(screen.getByRole('button', { name: /Buy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sell/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bought|Sold/ })).not.toBeInTheDocument();
  });

  it('sends a buy as new money when the box is not ticked', async () => {
    authorizedFetch.mockImplementation(() => answer({ success: true }));
    render(<TransactionForm cashAvailable={5000} />);
    fillBuy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ type: 'BOUGHT', symbol: 'AAPL', amount: 1800, paidWithCash: false });
  });

  it('sends a buy as paid with cash when the box is ticked', async () => {
    authorizedFetch.mockImplementation(() => answer({ success: true }));
    render(<TransactionForm cashAvailable={5000} />);
    fillBuy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Pay with cash/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ type: 'BOUGHT', paidWithCash: true });
  });

  it('forgets the tick when the person changes tab and comes back', () => {
    render(<TransactionForm cashAvailable={5000} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Pay with cash/ }));

    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    fireEvent.click(screen.getByRole('button', { name: /Buy/ }));

    expect(screen.getByRole('checkbox', { name: /Pay with cash/ })).not.toBeChecked();
  });

  it('says how much cash there is, and what to do instead, when the cash is not enough', async () => {
    authorizedFetch.mockImplementation(() =>
      answer({ error: 'You hold 250.50 EUR in cash and this purchase needs 1800.00 EUR.', code: 'INSUFFICIENT_CASH', currency: 'EUR', availableMinor: 25050 }, false),
    );
    render(<TransactionForm cashAvailable={5000} />);
    fillBuy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Pay with cash/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/You hold €250\.50 in cash, and this purchase needs more\. Untick "Pay with cash" to add new money instead\./)).toBeInTheDocument();
  });

  it('says there is no cash at all when the balance is zero', async () => {
    authorizedFetch.mockImplementation(() => answer({ error: 'x', code: 'INSUFFICIENT_CASH', currency: 'EUR', availableMinor: 0 }, false));
    render(<TransactionForm cashAvailable={5000} />);
    fillBuy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Pay with cash/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/You hold no cash in EUR, so this purchase cannot be paid with cash\./)).toBeInTheDocument();
  });
});
