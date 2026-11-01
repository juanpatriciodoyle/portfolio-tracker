import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeChangeDto } from '../../../contracts';
import { makePhase } from '../../../test/fixtures';
import IncomeSection from '../IncomeSection';

const ok = { ok: true as const, value: undefined };
const promotion: IncomeChangeDto = { startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: 'PROMOTION' };
const unemployed: IncomeChangeDto = { startDate: '2026-02-01', endDate: '2026-02-28', amountMinor: 0, reason: 'UNEMPLOYMENT' };

function renderSection(changes: IncomeChangeDto[] = [promotion], onUpdatePhase = vi.fn().mockResolvedValue(ok)) {
  const announce = vi.fn();
  render(<IncomeSection phase={makePhase({ startDate: '2026-01-01', incomeChanges: changes })} onUpdatePhase={onUpdatePhase} announce={announce} />);
  return { onUpdatePhase, announce };
}

describe('IncomeSection', () => {
  it('says what came in each month when it never changed, and invites a change', () => {
    renderSection([]);

    expect(screen.getByText(/€3,200 a month/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add an income change/ })).toBeInTheDocument();
  });

  it('lists the starting income and each change in date order, with its reason', () => {
    renderSection([promotion, unemployed]);

    const rows = within(screen.getByRole('list', { name: 'Income over time' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Starting income');
    expect(rows[0]).toHaveTextContent('€3,200 every month');
    expect(rows[1]).toHaveTextContent('Unemployment');
    expect(rows[1]).toHaveTextContent('€0 every month');
    expect(rows[2]).toHaveTextContent('Promotion');
    expect(rows[2]).toHaveTextContent('€3,500 every month');
  });

  it('adds a change and sends the whole list, so the server keeps what was there', async () => {
    const { onUpdatePhase, announce } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Add an income change/ }));

    fireEvent.click(screen.getByRole('button', { name: 'New job' }));
    fireEvent.change(screen.getByLabelText('Monthly income from then'), { target: { value: '4,000' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));

    await waitFor(() =>
      expect(onUpdatePhase).toHaveBeenCalledWith('p1', {
        incomeChanges: [promotion, { startDate: '2026-09-01', endDate: null, amountMinor: 400000, reason: 'NEW_JOB' }],
      })
    );
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Income change added'));
  });

  it('suggests no income for a stretch of unemployment, and takes an end date', async () => {
    const { onUpdatePhase } = renderSection([]);
    fireEvent.click(screen.getByRole('button', { name: /Add an income change/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Unemployment' }));
    expect(screen.getByLabelText('Monthly income from then')).toHaveValue('0');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Until (optional)'), { target: { value: '2026-02-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeChanges: [unemployed] }));
  });

  it('says what is wrong instead of saving: no start, an end before the start, a day outside the home', () => {
    const { onUpdatePhase } = renderSection([]);
    fireEvent.click(screen.getByRole('button', { name: /Add an income change/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));
    expect(screen.getByText('Pick the day it starts.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 3200 or 0.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06-01' } });
    fireEvent.change(screen.getByLabelText('Monthly income from then'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));
    expect(screen.getByText('Pick a day while you lived here.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Until (optional)'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));
    expect(screen.getByText('It cannot end before it starts.')).toBeInTheDocument();
    expect(onUpdatePhase).not.toHaveBeenCalled();
  });

  it('corrects a change in place', async () => {
    const { onUpdatePhase } = renderSection([promotion, unemployed]);

    fireEvent.click(screen.getByRole('button', { name: /Edit income change From Apr 1, 2026/ }));
    expect(screen.getByLabelText('Monthly income from then')).toHaveValue('3500');
    fireEvent.change(screen.getByLabelText('Monthly income from then'), { target: { value: '3600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeChanges: [unemployed, { ...promotion, amountMinor: 360000 }] }));
  });

  it('removes a change only after confirming, leaving the others', async () => {
    const { onUpdatePhase } = renderSection([promotion, unemployed]);

    fireEvent.click(screen.getByRole('button', { name: /Remove income change From Apr 1, 2026/ }));
    expect(onUpdatePhase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeChanges: [unemployed] }));
  });

  it('shows why a change could not be saved and keeps the form open', async () => {
    renderSection([], vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } }));
    fireEvent.click(screen.getByRole('button', { name: /Add an income change/ }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Monthly income from then'), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add income change' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add income change' })).toBeInTheDocument();
  });
});
