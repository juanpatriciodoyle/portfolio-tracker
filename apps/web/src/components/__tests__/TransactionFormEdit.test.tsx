import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as http from '../../lib/authorizedFetch';
import { setActiveLocale } from '../../i18n/activeLocale';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import type { EditableTransaction } from '../../lib/transactionRows';
import TransactionForm from '../TransactionForm';

vi.mock('../../lib/authorizedFetch', () => ({ authorizedFetch: vi.fn(), readAuthToken: vi.fn() }));

const authorizedFetch = http.authorizedFetch as unknown as Mock<(path: string, init?: RequestInit) => Promise<Response>>;
const answer = (body: unknown, ok = true, status = ok ? 200 : 400) => Promise.resolve({ ok, status, json: async () => body } as Response);

const buy: EditableTransaction = {
  id: 't1',
  type: 'BOUGHT',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  quantity: 10,
  amount: 1800,
  fee: 2,
  currency: 'EUR',
  date: '2026-03-03T00:00:00.000Z',
  paidWithCash: false,
};
const deposit: EditableTransaction = { id: 't2', type: 'DEPOSIT', symbol: 'CASH', quantity: 1, amount: 500, fee: 0, currency: 'EUR', date: '2026-01-05T00:00:00.000Z' };

const sent = () => ({ path: authorizedFetch.mock.calls[0][0], init: authorizedFetch.mock.calls[0][1], body: JSON.parse(String(authorizedFetch.mock.calls[0][1]?.body)) });

afterEach(() => setActiveLocale('en'));

beforeEach(() => {
  authorizedFetch.mockReset();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

describe('TransactionForm: money fields carry the currency sign', () => {
  it('shows the sign of the currency beside the amount and the fee, on a buy and on a cash operation', () => {
    render(<TransactionForm currency="EUR" />);

    for (const field of [screen.getByPlaceholderText('e.g. 1500.00'), screen.getByPlaceholderText('0.00')]) {
      expect(field.closest('.money-field')).toHaveTextContent('€');
    }

    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    expect(screen.getByPlaceholderText('e.g. 5000.00').closest('.money-field')).toHaveTextContent('€');
  });

  it("uses the person's own currency, in the language of the screen", () => {
    render(
      <LocaleProvider initial="es-AR">
        <TransactionForm currency="USD" />
      </LocaleProvider>,
    );

    expect(screen.getByPlaceholderText('p. ej. 1500,00').closest('.money-field')).toHaveTextContent('US$');
  });

  it('keeps the amount a plain labelled number field', () => {
    render(<TransactionForm currency="EUR" />);

    expect(screen.getByLabelText('Total amount paid')).toHaveAttribute('type', 'number');
  });
});

describe('TransactionForm: correcting a transaction', () => {
  it('opens on the transaction as it was, titled as an edit, with what was traded shown and not asked', () => {
    render(<TransactionForm editing={buy} currency="EUR" />);

    expect(screen.getByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(screen.getByText(/Apple Inc\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toHaveValue(10);
    expect(screen.getByLabelText('Total amount paid')).toHaveValue(1800);
    expect(screen.getByLabelText('Broker fee')).toHaveValue(2);
    expect(screen.getByLabelText('Transaction date')).toHaveValue('2026-03-03');
    expect(screen.queryByPlaceholderText(/SAN.MC, AAPL/)).not.toBeInTheDocument();
    for (const kind of [/^Sell/, /^Deposit/, /^Withdraw/]) expect(screen.queryByRole('button', { name: kind })).not.toBeInTheDocument();
  });

  it('cannot be saved until something has changed', () => {
    render(<TransactionForm editing={buy} currency="EUR" />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '1850' } });
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '1800.00' } });
    expect(save).toBeDisabled();
  });

  it('sends only what changed to that transaction, then tells its owner', async () => {
    authorizedFetch.mockImplementation(() => answer(undefined, true, 204));
    const onSuccess = vi.fn();
    render(<TransactionForm editing={buy} currency="EUR" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Total amount paid'), { target: { value: '1850.5' } });
    fireEvent.change(screen.getByLabelText('Transaction date'), { target: { value: '2026-03-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
    expect(sent().path).toBe('/api/transactions/t1');
    expect(sent().init?.method).toBe('PATCH');
    expect(sent().body).toEqual({ amount: 1850.5, date: '2026-03-04T00:00:00.000Z' });
  });

  it('saves once however many times the button is pressed', async () => {
    let finish: (value: Response) => void = () => undefined;
    authorizedFetch.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
    render(<TransactionForm editing={buy} currency="EUR" onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Broker fee'), { target: { value: '3' } });
    const save = screen.getByRole('button', { name: 'Save changes' });

    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);

    expect(authorizedFetch).toHaveBeenCalledTimes(1);
    finish({ ok: true, status: 204, json: async () => undefined } as Response);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument());
  });

  it('says in plain words which later transaction stops the change, and stays open', async () => {
    authorizedFetch.mockImplementation(() =>
      answer({ error: 'x', code: 'TRANSACTION_REQUIRED_BY_LATER', dependent: { id: 't9', type: 'SOLD', symbol: 'AAPL', date: '2026-04-01' } }, false, 409),
    );
    const onSuccess = vi.fn();
    render(<TransactionForm editing={buy} currency="EUR" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/a later transaction depends on it \(sale of AAPL, Apr 1, 2026\)/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('says so when the transaction is already gone', async () => {
    authorizedFetch.mockImplementation(() => answer({ error: 'Transaction not found' }, false, 404));
    render(<TransactionForm editing={buy} currency="EUR" onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Broker fee'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This transaction no longer exists. The list has been refreshed.')).toBeInTheDocument();
  });

  it('asks only for the amount, the fee and the day when correcting a deposit', () => {
    render(<TransactionForm editing={deposit} currency="EUR" />);

    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue(500);
    expect(screen.getByLabelText('Transaction date')).toHaveValue('2026-01-05');
  });

  it('lets a purchase paid with cash be switched back to new money even when no cash is left', () => {
    render(<TransactionForm editing={{ ...buy, paidWithCash: true }} currency="EUR" cashAvailable={0} />);

    expect(screen.getByRole('checkbox', { name: /Pay with cash/ })).toBeChecked();
  });

  it('offers paying with cash on a purchase that brought new money only while there is cash', () => {
    const { rerender } = render(<TransactionForm editing={buy} currency="EUR" cashAvailable={0} />);
    expect(screen.queryByRole('checkbox', { name: /Pay with cash/ })).not.toBeInTheDocument();

    rerender(<TransactionForm editing={buy} currency="EUR" cashAvailable={3000} />);
    const box = screen.getByRole('checkbox', { name: /Pay with cash/ });
    expect(within(box.closest('label')!).getByText('Available: €3,000')).toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});
