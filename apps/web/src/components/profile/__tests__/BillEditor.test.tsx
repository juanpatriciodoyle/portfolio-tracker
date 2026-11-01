import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeBill } from '../../../test/fixtures';
import BillEditor from '../BillEditor';
import type { BillFormContext } from '../billForm';

const ok = { ok: true as const, value: undefined };
const context: BillFormContext = { today: '2026-10-31', countryCode: 'ES', history: [{ vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' }] };

function renderEditor(props: Partial<React.ComponentProps<typeof BillEditor>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(ok);
  const onCancel = vi.fn();
  render(<BillEditor phaseId="p1" currency="EUR" context={context} onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel };
}

const fillValid = () => {
  fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
  fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '96,50' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
};

describe('BillEditor for a new bill', () => {
  it('starts with nothing picked and no dates', () => {
    renderEditor();

    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByLabelText('Covers from')).toHaveValue('');
    expect(screen.getByLabelText('Until')).toHaveValue('');
  });

  it('fills the dates, ending today, when a cadence is picked first', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }));

    expect(screen.getByLabelText('Covers from')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-10-31');
  });

  it('picks the cadence the dates match when they are entered first', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Covers from'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-09-30' } });

    expect(screen.getByRole('radio', { name: 'Every 3 months' })).toBeChecked();
  });

  it('moves on to the cadence that fits when the dates outgrow the one that was picked', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));

    fireEvent.change(screen.getByLabelText('Covers from'), { target: { value: '2026-08-01' } });

    expect(screen.getByRole('radio', { name: 'Every 3 months' })).toBeChecked();
  });

  it('preselects the category and cadence from the sender typed, until the person picks their own', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Octopus Energy' } });

    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Gas' }));
    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'NESS' } });

    expect(screen.getByRole('radio', { name: 'Gas' })).toBeChecked();
  });

  it('reads a heating sender as heating / cooling', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'NESS' } });

    expect(screen.getByRole('radio', { name: 'Heating / cooling' })).toBeChecked();
  });

  it('offers every cadence, including one-off', () => {
    renderEditor();

    expect(screen.getAllByRole('radio', { name: /^(Monthly|Every 2 months|Every 3 months|Yearly|One-off)$/ }).map((radio) => radio.getAttribute('value'))).toEqual([
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

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText('Pick what this bill is for.')).toBeInTheDocument();
    expect(screen.getByText('Who sent this bill?')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 96 or 96.50.')).toBeInTheDocument();
    expect(screen.getByText('Pick how often this bill comes.')).toBeInTheDocument();
    expect(screen.getByText('Pick the first day the bill covers.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Who sent it?')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a bill that ends before it starts', () => {
    const { onSubmit } = renderEditor();
    fillValid();
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-09-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText('The bill cannot end before it starts.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses dates longer than the cadence allows, naming the limit', () => {
    const { onSubmit } = renderEditor();
    fillValid();
    fireEvent.change(screen.getByLabelText('Covers from'), { target: { value: '2024-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText(/can cover at most 35 days/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the server’s reason when the bill is rejected, and keeps what was typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'not-found', message: 'living phase not found' } });
    renderEditor({ onSubmit });
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('That item no longer exists. It may have been removed elsewhere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('Iberdrola');
  });

  it('can be cancelled', () => {
    const { onCancel } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('leaves the dates empty when picking a cadence while the server day is not known', () => {
    renderEditor({ context: { ...context, today: null } });

    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));

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
