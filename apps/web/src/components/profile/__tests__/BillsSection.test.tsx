import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BillingRecordDto } from '../../../contracts';
import { makeBill, makeObserved, makePhase } from '../../../test/fixtures';
import type { BillingView } from '../billingView';
import BillsSection from '../BillsSection';

const ok = { ok: true as const, value: undefined };

function renderSection(records: BillingRecordDto[] = [], overrides: Partial<BillingView> = {}) {
  const billing: BillingView = {
    asOf: '2026-10-31',
    recordsFor: () => records,
    observedFor: () => undefined,
    onAdd: vi.fn().mockResolvedValue(ok),
    onUpdate: vi.fn().mockResolvedValue(ok),
    onDelete: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
  const announce = vi.fn();
  render(<BillsSection phase={makePhase()} billing={billing} announce={announce} />);
  return { billing, announce };
}

describe('BillsSection listing', () => {
  it('invites the first bill when there are none, and shows no drift line', () => {
    renderSection([], { observedFor: () => makeObserved() });

    expect(screen.getByRole('heading', { name: 'Bills received' })).toBeInTheDocument();
    expect(screen.getByText(/No bills logged yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Bills say about/)).not.toBeInTheDocument();
  });

  it('lists bills newest first with vendor, category, amount, cadence and the months they cover', () => {
    renderSection([
      makeBill({ id: 'old', vendor: 'Canal', category: 'WATER', cadence: 'QUARTERLY', amountMinor: 4500, periodStart: '2026-01-01', periodEnd: '2026-03-31' }),
      makeBill({ id: 'new' }),
      makeBill({ id: 'fee', vendor: 'Locksmith', category: 'OTHER', cadence: 'ONE_OFF', amountMinor: 12000, periodStart: '2026-05-04', periodEnd: '2026-05-04' }),
    ]);

    const rows = screen.getAllByRole('listitem');

    expect(rows.map((row) => row.getAttribute('data-category'))).toEqual(['ELECTRICITY', 'OTHER', 'WATER']);
    expect(rows[0]).toHaveTextContent('Iberdrola · Electricity');
    expect(rows[0]).toHaveTextContent('Jul 2026 – Sep 2026');
    expect(rows[0]).toHaveTextContent('€96 every 2 months');
    expect(rows[1]).toHaveTextContent('Locksmith · Other');
    expect(rows[1]).toHaveTextContent('€120 one-off');
    expect(rows[1]).toHaveTextContent('May 2026');
    expect(rows[2]).toHaveTextContent('€45 every 3 months');
  });

  it('shows how bills compare with what was declared, in words and with a sign', () => {
    renderSection([makeBill()], { observedFor: () => makeObserved() });

    expect(screen.getByText(/Bills say about €1,310 a month vs €1,293 declared \(\+€17\)\./)).toBeInTheDocument();
    expect(screen.getByText('Based on 5 months of bills.')).toBeInTheDocument();
  });

  it('shows only the latest bills, and the rest on request', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      makeBill({ id: `b${index}`, vendor: `Vendor ${index}`, periodStart: `2026-0${index + 1}-01`, periodEnd: `2026-0${index + 1}-28` })
    );
    renderSection(many);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText(/Vendor 0/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 bills' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer bills' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('BillsSection logging a bill', () => {
  it('opens the form from "Log a bill", and submits through the page', async () => {
    const { billing, announce } = renderSection([]);

    fireEvent.click(screen.getByRole('button', { name: /Log a bill/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Gas' }));
    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Naturgy' } });
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '31.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    await waitFor(() =>
      expect(billing.onAdd).toHaveBeenCalledWith({
        phaseId: 'p1',
        category: 'GAS',
        cadence: 'MONTHLY',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        amountMinor: 3120,
        vendor: 'Naturgy',
      })
    );
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Log a bill' })).not.toBeInTheDocument());
    expect(announce).toHaveBeenCalledWith('Bill logged');
  });

  it('keeps the form open when the bill is rejected', async () => {
    renderSection([], { onAdd: vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'unknown', message: 'Server said no' } }) });
    fireEvent.click(screen.getByRole('button', { name: /Log a bill/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Gas' }));
    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Naturgy' } });
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '31' } });

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    expect(await screen.findByText('Server said no')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Log a bill' })).toBeInTheDocument();
  });
});

describe('BillsSection changing and removing', () => {
  it('edits a bill without sending its phase (a bill cannot move)', async () => {
    const { billing, announce } = renderSection([makeBill()]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Electricity bill from Iberdrola' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(billing.onUpdate).toHaveBeenCalledWith('b1', {
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 9900,
        vendor: 'Iberdrola',
      })
    );
    expect(announce).toHaveBeenCalledWith('Bill updated');
  });

  it('asks before removing, and only removes on confirmation', async () => {
    const { billing, announce } = renderSection([makeBill()]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Electricity bill from Iberdrola' }));
    expect(billing.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText('Remove this bill?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Electricity bill from Iberdrola' }));
    fireEvent.click(within(screen.getByRole('group', { name: /Confirm removing/ })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(billing.onDelete).toHaveBeenCalledWith('b1'));
    expect(announce).toHaveBeenCalledWith('Bill removed');
  });

  it('says why a removal failed', async () => {
    renderSection([makeBill()], { onDelete: vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'not-found', message: 'gone' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Electricity bill from Iberdrola' }));
    fireEvent.click(within(screen.getByRole('group', { name: /Confirm removing/ })).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That item no longer exists.');
  });
});

describe('BillsSection adding from a PDF', () => {
  const extraction = {
    draft: { amountMinor: 4500, currency: 'EUR', vendor: 'Canal', category: 'WATER', cadence: 'QUARTERLY', periodStart: '2026-01-01', periodEnd: '2026-03-31' },
    textFound: true,
    pages: 1,
    suggestedPhaseId: 'p1',
  };

  it('offers the PDF picker, opens the review for the chosen file and logs the bill through the same path as a typed one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: '', json: async () => extraction } as Response));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    const { billing, announce } = renderSection([]);

    const input = screen.getByLabelText('Choose a bill PDF') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'application/pdf');
    expect(screen.getByRole('button', { name: /Add from a PDF/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'agua.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Log bill' }));

    await waitFor(() => expect(billing.onAdd).toHaveBeenCalledWith(expect.objectContaining({ phaseId: 'p1', vendor: 'Canal', amountMinor: 4500, category: 'WATER' })));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Bill logged'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
