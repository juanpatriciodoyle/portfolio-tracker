import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeStreamDto } from '../../../contracts';
import { makePhase } from '../../../test/fixtures';
import IncomeSection from '../IncomeSection';

const ok = { ok: true as const, value: undefined };
const job: IncomeStreamDto = { label: 'Salary', amountMinor: 320000, startDate: '2026-01-01', endDate: null };
const freelance: IncomeStreamDto = { label: 'Freelance consulting', amountMinor: 80000, startDate: '2026-03-01', endDate: '2026-06-30' };

function renderSection(streams: IncomeStreamDto[] = [job], onUpdatePhase = vi.fn().mockResolvedValue(ok), asOf?: string) {
  const announce = vi.fn();
  render(<IncomeSection phase={makePhase({ startDate: '2026-01-01', incomeStreams: streams })} asOf={asOf} onUpdatePhase={onUpdatePhase} announce={announce} />);
  return { onUpdatePhase, announce };
}

const fillStream = (label: string, amount: string) => {
  fireEvent.change(screen.getByLabelText('Role or source'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Net per month'), { target: { value: amount } });
};

describe('IncomeSection', () => {
  it('has nothing to explain when there is no income: only a way to add some', () => {
    renderSection([]);

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add job or income' })).toBeInTheDocument();
    expect(screen.queryByText(/Did it change here/)).not.toBeInTheDocument();
  });

  it('lists every stream by when it started, with its label, dates and monthly amount', () => {
    renderSection([freelance, job]);

    const rows = screen.getAllByRole('listitem');
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
    fireEvent.click(screen.getByRole('button', { name: 'Add job or income' }));

    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01');
    fillStream('Freelance consulting', '800');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Last day paid (optional)'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [job, freelance] }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Income added'));
  });

  it('says what is wrong instead of saving: no name, no amount, a day outside the home, an end before the start', () => {
    const { onUpdatePhase } = renderSection([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add job or income' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByText('Name it, for example Salary.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 3200.')).toBeInTheDocument();

    fillStream('Job', '10');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByText('Pick a day while you lived here.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Last day paid (optional)'), { target: { value: '2026-02-01' } });
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
    fireEvent.click(screen.getByRole('button', { name: 'Add job or income' }));
    fillStream('Job', '100');

    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add income' })).toBeInTheDocument();
  });

  describe('job lifecycle', () => {
    const designer: IncomeStreamDto = { label: 'Designer', amountMinor: 300000, startDate: '2026-01-01', endDate: null };
    const consulting: IncomeStreamDto = { label: 'Consulting', amountMinor: 200000, startDate: '2026-01-01', endDate: null };
    const today = '2026-06-15';

    it('ends one job on a chosen day with a reason, and leaves the other untouched', async () => {
      const { onUpdatePhase, announce } = renderSection([consulting, designer], undefined, today);

      fireEvent.click(screen.getByRole('button', { name: /End job Designer/ }));
      expect(screen.getByLabelText('Last day paid')).toHaveValue(today);
      fireEvent.change(screen.getByLabelText('Last day paid'), { target: { value: '2026-05-31' } });
      fireEvent.click(screen.getByLabelText('Laid off'));
      fireEvent.click(within(screen.getByRole('group', { name: 'End Designer' })).getByRole('button', { name: 'End job' }));

      await waitFor(() =>
        expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [consulting, { ...designer, endDate: '2026-05-31', endReason: 'LAID_OFF' }] })
      );
      await waitFor(() => expect(announce).toHaveBeenCalledWith('Job ended'));
    });

    it('lists the ended job apart, says why and when, and says no income was coming in only while no job was paying', () => {
      renderSection([{ ...designer, endDate: '2026-03-31', endReason: 'LAID_OFF' }, { ...consulting, endDate: '2026-05-12', endReason: 'CONTRACT_FINISHED' }], undefined, today);

      expect(screen.getByRole('list', { name: 'Ended' })).toHaveTextContent('Laid off · ended Mar 31, 2026');
      expect(screen.getByRole('list', { name: 'Ended' })).toHaveTextContent('Contract finished · ended May 12, 2026');
      expect(screen.queryByRole('list', { name: 'Paying now' })).not.toBeInTheDocument();
      expect(screen.getByText('No income since May 13, 2026')).toBeInTheDocument();
    });

    it('shows no gap notice while another job keeps paying', () => {
      renderSection([{ ...designer, endDate: '2026-03-31' }, consulting], undefined, today);

      expect(screen.getByRole('list', { name: 'Paying now' })).toHaveTextContent('Consulting');
      expect(screen.getByRole('list', { name: 'Ended' })).toHaveTextContent('Designer');
      expect(screen.queryByText(/^No income/)).not.toBeInTheDocument();
    });

    it('names a gap that a later job closed', () => {
      renderSection([{ ...designer, endDate: '2026-03-31' }, { ...consulting, startDate: '2026-05-01' }], undefined, today);
      expect(screen.getByText('No income from Apr 1, 2026 to Apr 30, 2026')).toBeInTheDocument();
    });

    it('brings an ended job back, with no end and no reason', async () => {
      const { onUpdatePhase } = renderSection([{ ...designer, endDate: '2026-03-31', endReason: 'QUIT' }], undefined, today);

      fireEvent.click(screen.getByRole('button', { name: /Bring back Designer/ }));

      await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledWith('p1', { incomeStreams: [designer] }));
    });

    it('does not offer to end a job that has ended already', () => {
      renderSection([{ ...designer, endDate: '2026-03-31' }], undefined, today);
      expect(screen.queryByRole('button', { name: /End job/ })).not.toBeInTheDocument();
    });

    it('records a deposit that arrived once: one date, no end, and not counted as a monthly job', async () => {
      const { onUpdatePhase } = renderSection([designer], undefined, today);

      fireEvent.click(screen.getByRole('button', { name: 'Add job or income' }));
      fireEvent.click(screen.getByLabelText('Paid once'));
      expect(screen.queryByLabelText('Last day paid (optional)')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Role or source'), { target: { value: 'Unemployment benefit' } });
      fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '1200' } });
      fireEvent.change(screen.getByLabelText('Date received'), { target: { value: '2026-04-10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add deposit' }));

      await waitFor(() =>
        expect(onUpdatePhase).toHaveBeenCalledWith('p1', {
          incomeStreams: [designer, { label: 'Unemployment benefit', amountMinor: 120000, startDate: '2026-04-10', endDate: null, kind: 'ONE_TIME' }],
        })
      );
    });

    it('lists a one-time deposit as paid once, in its own group', () => {
      renderSection([designer, { label: 'Benefit', amountMinor: 120000, startDate: '2026-04-10', endDate: null, kind: 'ONE_TIME' }], undefined, today);

      expect(screen.getByRole('list', { name: 'One-time deposits' })).toHaveTextContent('Paid Apr 10, 2026');
      expect(screen.getByRole('list', { name: 'One-time deposits' })).toHaveTextContent('€1,200 once');
      expect(screen.queryByRole('button', { name: /End job Benefit/ })).not.toBeInTheDocument();
    });
  });
});
