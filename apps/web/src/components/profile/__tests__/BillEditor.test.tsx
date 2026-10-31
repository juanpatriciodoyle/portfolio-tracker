import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeBill } from '../../../test/fixtures';
import BillEditor from '../BillEditor';

const ok = { ok: true as const, value: undefined };

function renderEditor(props: Partial<React.ComponentProps<typeof BillEditor>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(ok);
  const onCancel = vi.fn();
  render(<BillEditor phaseId="p1" currency="EUR" asOf="2026-10-31" onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel };
}

const fillValid = () => {
  fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
  fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
  fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '96,50' } });
};

describe('BillEditor for a new bill', () => {
  it('starts with last month filled in, so most bills need no date typing', () => {
    renderEditor();

    expect(screen.getByLabelText('Covers from')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-09-30');
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
  });

  it('offers every cadence, including one-off', () => {
    renderEditor();

    expect(screen.getAllByRole('radio', { name: /^(Monthly|Every 2 months|Quarterly|Yearly|One-off)$/ }).map((radio) => radio.getAttribute('value'))).toEqual([
      'MONTHLY',
      'BIMONTHLY',
      'QUARTERLY',
      'ANNUAL',
      'ONE_OFF',
    ]);
  });

  it('submits exactly what the API expects', async () => {
    const { onSubmit } = renderEditor();
    fillValid();
    fireEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }));
    fireEvent.change(screen.getByLabelText('Covers from'), { target: { value: '2026-07-15' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-09-14' } });

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        phaseId: 'p1',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 9650,
        vendor: 'Iberdrola',
      })
    );
  });

  it('says what is missing and does not submit', () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    expect(screen.getByText('Pick what this bill is for.')).toBeInTheDocument();
    expect(screen.getByText('Who sent this bill?')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 96 or 96.50.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Who sent it?')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a bill that ends before it starts', () => {
    const { onSubmit } = renderEditor();
    fillValid();
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-08-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    expect(screen.getByText('The bill cannot end before it starts.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the server’s reason when the bill is rejected, and keeps what was typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'not-found', message: 'living phase not found' } });
    renderEditor({ onSubmit });
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    expect(await screen.findByText('That item no longer exists. It may have been removed elsewhere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('Iberdrola');
  });

  it('can be cancelled', () => {
    const { onCancel } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('leaves the dates empty when the server day is not known', () => {
    renderEditor({ asOf: null });

    expect(screen.getByLabelText('Covers from')).toHaveValue('');
  });
});

describe('BillEditor for an existing bill', () => {
  it('is filled in from the bill, with the amount in major units', () => {
    renderEditor({ initial: makeBill({ amountMinor: 9650 }) });

    expect(screen.getByRole('form', { name: 'Edit bill' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('Iberdrola');
    expect(screen.getByLabelText('Total on the bill')).toHaveValue('96.50');
    expect(screen.getByLabelText('Covers from')).toHaveValue('2026-07-15');
  });

  it('saves a corrected amount', async () => {
    const { onSubmit } = renderEditor({ initial: makeBill() });
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '99' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 9900, vendor: 'Iberdrola' })));
  });
});
