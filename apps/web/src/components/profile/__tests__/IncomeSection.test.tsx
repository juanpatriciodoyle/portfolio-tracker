import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeStreamDto } from '../../../contracts';
import { makePhase } from '../../../test/fixtures';
import IncomeSection from '../IncomeSection';

const ok = { ok: true as const, value: undefined };
const job: IncomeStreamDto = { label: 'Salary', amountMinor: 320000, startDate: '2026-01-01', endDate: null };
const freelance: IncomeStreamDto = { label: 'Freelance consulting', amountMinor: 80000, startDate: '2026-03-01', endDate: '2026-06-30' };

function renderSection(streams: IncomeStreamDto[] = [job], onUpdatePhase = vi.fn().mockResolvedValue(ok)) {
  const announce = vi.fn();
  render(<IncomeSection phase={makePhase({ startDate: '2026-01-01', incomeStreams: streams })} onUpdatePhase={onUpdatePhase} announce={announce} />);
  return { onUpdatePhase, announce };
}

const fillStream = (label: string, amount: string) => {
  fireEvent.change(screen.getByLabelText('Role or source'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Net per month'), { target: { value: amount } });
};

describe('IncomeSection', () => {
  it('has nothing to explain when there is no income: only a way to add some', () => {
    renderSection([]);

    expect(screen.queryByRole('list', { name: 'Income' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add income' })).toBeInTheDocument();
    expect(screen.queryByText(/Did it change here/)).not.toBeInTheDocument();
  });

  it('lists every stream by when it started, with its label, dates and monthly amount', () => {
    renderSection([freelance, job]);

    const rows = within(screen.getByRole('list', { name: 'Income' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Salary');
    expect(rows[0]).toHaveTextContent('From Jan 1, 2026');
    expect(rows[0]).toHaveTextContent('€3,200 every month');
    expect(rows[1]).toHaveTextContent('Freelance consulting');
    expect(rows[1]).toHaveTextContent('Mar 1, 2026 – Jun 30, 2026');
    expect(rows[1]).toHaveTextContent('€800 every month');
  });

  it('adds a stream, starting on the first day of the home, and sends the whole list', async () => {
    const { onUpdatePhase, announce } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01');
    fillStream('Freelance consulting', '800');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Until (optional)'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [job, freelance] }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Income added'));
  });

  it('says what is wrong instead of saving: no name, no amount, a day outside the home, an end before the start', () => {
    const { onUpdatePhase } = renderSection([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByText('Name it, for example Salary.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 3200.')).toBeInTheDocument();

    fillStream('Job', '10');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByText('Pick a day while you lived here.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Until (optional)'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByText('It cannot end before it starts.')).toBeInTheDocument();
    expect(onUpdatePhase).not.toHaveBeenCalled();
  });

  it('corrects a stream in place', async () => {
    const { onUpdatePhase } = renderSection([job, freelance]);

    fireEvent.click(screen.getByRole('button', { name: /Edit Salary From Jan 1, 2026/ }));
    expect(screen.getByLabelText('Net per month')).toHaveValue('3200');
    fireEvent.change(screen.getByLabelText('Net per month'), { target: { value: '3300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [{ ...job, amountMinor: 330000 }, freelance] }));
  });

  it('removes a stream only after confirming, leaving the others', async () => {
    const { onUpdatePhase } = renderSection([job, freelance]);

    fireEvent.click(screen.getByRole('button', { name: /Remove Salary From Jan 1, 2026/ }));
    expect(onUpdatePhase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [freelance] }));
  });

  it('can remove the last stream: a home may have no income at all', async () => {
    const { onUpdatePhase } = renderSection([job]);

    fireEvent.click(screen.getByRole('button', { name: /Remove Salary/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [] }));
  });

  it('shows why a stream could not be saved and keeps the form open', async () => {
    renderSection([], vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    fillStream('Job', '100');

    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add income' })).toBeInTheDocument();
  });
});
