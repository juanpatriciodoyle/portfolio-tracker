import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import type { BillFormContext } from '../billForm';
import ExpenseModal from '../ExpenseModal';

const ok = { ok: true as const, value: undefined };

const madrid = makePhase({ id: 'madrid', name: 'Madrid', startDate: '2022-09-01', endDate: '2024-08-31', currency: 'EUR' });
const buenosAires = makePhase({ id: 'ba', name: 'Buenos Aires', countryCode: 'AR', startDate: '2024-09-01', endDate: null, currency: 'ARS' });
const context: BillFormContext = { today: '2026-10-31', countryCode: 'AR', history: [{ vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' }] };

function renderModal(overrides: Partial<React.ComponentProps<typeof ExpenseModal>> = {}) {
  const props: React.ComponentProps<typeof ExpenseModal> = {
    phases: [madrid, buenosAires],
    ratePhase: buenosAires,
    context,
    onSubmit: vi.fn().mockResolvedValue(ok),
    onSubmitRate: vi.fn().mockResolvedValue(ok),
    onPickPdfs: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ExpenseModal {...props} />);
  return props;
}

const openRate = () => fireEvent.click(screen.getByRole('radio', { name: 'Recurring fixed rate' }));

describe('adding a bill receipt', () => {
  it('starts on a single bill receipt, with the recurring fixed rate as the other choice', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Add an expense' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Single bill receipt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Recurring fixed rate' })).not.toBeChecked();
    expect(screen.getByLabelText('Covers from')).toBeInTheDocument();
  });

  it('preselects the category from the sender and logs the bill in the home its dates fall in', async () => {
    const props = renderModal();

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Netflix' } });
    expect(screen.getByRole('radio', { name: 'Subscriptions' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '12.99' } });
    fireEvent.change(screen.getByLabelText('Covers from'), { target: { value: '2023-03-01' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2023-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith({
        phaseId: 'madrid',
        category: 'SUBSCRIPTIONS',
        cadence: 'MONTHLY',
        periodStart: '2023-03-01',
        periodEnd: '2023-03-31',
        amountMinor: 1299,
        vendor: 'Netflix',
      })
    );
  });

  it('reads the amount in the currency of the home the dates point to', async () => {
    const props = renderModal();

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Edenor' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '45.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    // The cadence filled the days ending today (2026-10-31), a day lived in Buenos Aires.
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ phaseId: 'ba', periodEnd: '2026-10-31' })));
  });

  it('says no home covers the days instead of guessing one', async () => {
    const props = renderModal({ phases: [madrid] });

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText(/No living phase covers that day/)).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('recognises a sender the person already has', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Octopus Energy' } });

    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
  });

  it('closes with Cancel', () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it('says nothing about what each kind means: the choices speak for themselves', () => {
    renderModal();

    expect(screen.queryByText(/always go here|until bills you log later/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^For /)).not.toBeInTheDocument();
  });
});

describe('adding a fixed rate', () => {
  it('saves a new subscription in the home lived in today, with an amount and a cadence and no bill period', async () => {
    const props = renderModal();
    openRate();

    expect(screen.queryByLabelText('Covers from')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Subscriptions' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '9,99' } });
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Spotify' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    await waitFor(() =>
      expect(props.onSubmitRate).toHaveBeenCalledWith(buenosAires, { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: 999, label: 'Spotify' })
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('offers only the fixed categories: the ones whose bill changes every time are logged as receipts', () => {
    renderModal();
    openRate();

    const offered = screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));
    expect(offered).toEqual(expect.arrayContaining(['RENT', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS', 'OTHER']));
    for (const variable of ['ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING', 'TAXES']) expect(offered).not.toContain(variable);
  });

  it('suggests the category and cadence from the label typed, until the person picks their own', () => {
    renderModal();
    openRate();

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Netflix' } });
    expect(screen.getByRole('radio', { name: 'Subscriptions' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Digi' } });
    expect(screen.getByRole('radio', { name: 'Other' })).toBeChecked();
  });

  it('asks for the category and the amount, and shows the reason when saving fails', async () => {
    const onSubmitRate = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    renderModal({ onSubmitRate });
    openRate();

    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));
    expect(screen.getByText('Pick what this bill is for.')).toBeInTheDocument();
    expect(onSubmitRate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Add an expense' })).getByRole('button', { name: 'Add recurring cost' })).toBeInTheDocument();
  });

  it('keeps the PDF drop zone for receipts, since a PDF is always a dated bill', () => {
    renderModal();
    expect(screen.getByLabelText('Choose bill PDFs')).toBeInTheDocument();

    openRate();
    expect(screen.queryByLabelText('Choose bill PDFs')).not.toBeInTheDocument();
  });
});
