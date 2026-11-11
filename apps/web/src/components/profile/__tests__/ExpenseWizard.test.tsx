import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import type { BillFormContext } from '../billForm';
import ExpenseWizard from '../ExpenseWizard';

const ok = { ok: true as const, value: undefined };

const madrid = makePhase({ id: 'madrid', name: 'Madrid', startDate: '2022-09-01', endDate: '2024-08-31', currency: 'EUR' });
const lisbon = makePhase({ id: 'lisbon', name: 'Lisbon', countryCode: 'PT', startDate: '2024-09-01', endDate: null, currency: 'EUR' });
const context: BillFormContext = {
  today: '2026-10-31',
  countryCode: 'PT',
  history: [{ vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' }],
};

function renderWizard(overrides: Partial<React.ComponentProps<typeof ExpenseWizard>> = {}) {
  const props: React.ComponentProps<typeof ExpenseWizard> = {
    phases: [madrid, lisbon],
    context,
    onSubmitReceipt: vi.fn().mockResolvedValue(ok),
    onSubmitRate: vi.fn().mockResolvedValue(ok),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ExpenseWizard {...props} />);
  return props;
}

const startManually = () => fireEvent.click(screen.getByRole('button', { name: 'Enter it manually' }));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the first step', () => {
  it('leads with a large PDF drop zone and a clear way to type it in, and asks nothing about how it is stored', () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: 'Add an expense' })).toBeInTheDocument();
    expect(screen.getByText('How do you want to add it?')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose bill PDFs')).toBeInTheDocument();
    expect(screen.getByText(/Drop your bills here/)).toBeInTheDocument();
    expect(screen.queryByText(/receipt|recurring|fixed rate/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Who sent it?')).not.toBeInTheDocument();
  });

  it('moves on to the questions, one step at a time, when the person enters it manually', () => {
    renderWizard();

    startManually();

    expect(screen.getByText('Who sent it, and what is it for?')).toBeInTheDocument();
    expect(screen.getByLabelText('Who sent it?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Total on the bill')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Covers from')).not.toBeInTheDocument();
  });

  it('goes back to the choice from the first question', () => {
    renderWizard();
    startManually();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('How do you want to add it?')).toBeInTheDocument();
  });
});

describe('the steps check each answer where it is given', () => {
  it('stays on the sender step until it is answered', () => {
    renderWizard();
    startManually();

    next();

    expect(screen.getByText('Who sent it?', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Pick what this is for.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Total on the bill')).not.toBeInTheDocument();
  });

  it('wants an amount and how often before moving on', () => {
    renderWizard();
    startManually();
    type('Who sent it?', 'Landlord');
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    next();

    next();

    expect(screen.getByText('Enter an amount such as 96 or 96.50.')).toBeInTheDocument();
    expect(screen.getByText('Pick how often it comes.')).toBeInTheDocument();
  });
});

describe('how an expense is stored follows from the answers', () => {
  it('declares what a subscription costs when it repeats and covers no days', async () => {
    const props = renderWizard();
    startManually();

    type('Who sent it?', 'Netflix');
    expect(screen.getByRole('radio', { name: 'Subscriptions' })).toBeChecked();
    next();
    type('Total on the bill', '12.99');
    expect(screen.getByRole('radio', { name: 'Every month' })).toBeChecked();
    next();

    expect(screen.getByText(/Optional/)).toBeInTheDocument();
    expect(screen.getByLabelText('Covers from')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(props.onSubmitRate).toHaveBeenCalledWith(lisbon, { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: 1299, label: 'Netflix' }));
    expect(props.onSubmitReceipt).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('offers the latest period for a bill that changes every time, and logs it in the home its first day falls in', async () => {
    const props = renderWizard();
    startManually();

    type('Who sent it?', 'Octopus Energy');
    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    next();
    type('Total on the bill', '96.50');
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
    next();

    expect(screen.getByLabelText('Until')).toHaveValue('2026-10-31');
    expect(screen.getByLabelText('Covers from')).not.toHaveValue('');
    type('Covers from', '2023-03-01');
    type('Until', '2023-04-30');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(props.onSubmitReceipt).toHaveBeenCalledWith({
        phaseId: 'madrid',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2023-03-01',
        periodEnd: '2023-04-30',
        amountMinor: 9650,
        vendor: 'Octopus Energy',
      })
    );
    expect(props.onSubmitRate).not.toHaveBeenCalled();
  });

  it('keeps a bill that covers more days than how often it comes from being logged', () => {
    renderWizard();
    startManually();
    type('Who sent it?', 'Octopus Energy');
    next();
    type('Total on the bill', '96.50');
    fireEvent.click(screen.getByRole('radio', { name: 'Every month' }));
    next();

    type('Covers from', '2026-01-01');
    type('Until', '2026-03-31');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText(/can cover at most 35 days/)).toBeInTheDocument();
  });

  it('does not ask for "from – until" for a one-time expense: just the day it was paid', async () => {
    const props = renderWizard();
    startManually();
    type('Who sent it?', 'Airalo eSIM');
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    next();
    type('Total on the bill', '18');
    fireEvent.click(screen.getByRole('radio', { name: 'One time only' }));
    next();

    expect(screen.getByText('When was it paid?')).toBeInTheDocument();
    expect(screen.getByLabelText('The day it was paid')).toHaveValue('2026-10-31');
    expect(screen.queryByLabelText('Until')).not.toBeInTheDocument();
    type('The day it was paid', '2023-05-02');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(props.onSubmitReceipt).toHaveBeenCalledWith({
        phaseId: 'madrid',
        category: 'OTHER',
        cadence: 'ONE_OFF',
        periodStart: '2023-05-02',
        periodEnd: '2023-05-02',
        amountMinor: 1800,
        vendor: 'Airalo eSIM',
      })
    );
  });

  it('lets a one-time stay cover several days', async () => {
    const props = renderWizard();
    startManually();
    type('Who sent it?', 'Airbnb');
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    next();
    type('Total on the bill', '1400');
    fireEvent.click(screen.getByRole('radio', { name: 'One time only' }));
    next();

    fireEvent.click(screen.getByRole('radio', { name: 'Covers several days' }));
    type('Covers from', '2023-06-01');
    type('Until', '2023-06-30');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(props.onSubmitReceipt).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'ONE_OFF', periodStart: '2023-06-01', periodEnd: '2023-06-30' })));
  });

  it('asks "Will this come again?" for a rent with days, and a no makes it a one-off', async () => {
    const props = renderWizard();
    startManually();
    type('Who sent it?', 'Landlord');
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    next();
    type('Total on the bill', '900');
    fireEvent.click(screen.getByRole('radio', { name: 'Every month' }));
    next();
    type('Covers from', '2023-01-01');
    type('Until', '2023-01-31');
    next();

    expect(screen.getByText('Will this come again?', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByText('Pick one.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'No, only this once' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(props.onSubmitReceipt).toHaveBeenCalledWith(expect.objectContaining({ phaseId: 'madrid', cadence: 'ONE_OFF', periodStart: '2023-01-01' })));
  });

  it('keeps the monthly cadence when the person says a rent with days repeats', async () => {
    const props = renderWizard();
    startManually();
    type('Who sent it?', 'Landlord');
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    next();
    type('Total on the bill', '900');
    fireEvent.click(screen.getByRole('radio', { name: 'Every month' }));
    next();
    type('Covers from', '2023-01-01');
    type('Until', '2023-01-31');
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, it repeats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(props.onSubmitReceipt).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'MONTHLY' })));
  });

  it('never asks it for a bill that changes every time', () => {
    renderWizard();
    startManually();
    type('Who sent it?', 'Octopus Energy');
    next();
    type('Total on the bill', '96.50');
    next();

    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument();
    expect(screen.queryByText('Will this come again?')).not.toBeInTheDocument();
  });

  it('says so, and guesses nothing, when no home covers the day', async () => {
    const props = renderWizard();
    startManually();
    type('Who sent it?', 'Octopus Energy');
    next();
    type('Total on the bill', '96.50');
    next();
    type('Covers from', '2019-01-01');
    type('Until', '2019-02-28');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('No living phase covers that day. Pick a day you lived somewhere.')).toBeInTheDocument();
    expect(props.onSubmitReceipt).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says so when the bill is already recorded', async () => {
    const onSubmitReceipt = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'duplicate', message: 'dup', existingRecordId: 'b1' } });
    const props = renderWizard({ onSubmitReceipt });
    startManually();
    type('Who sent it?', 'Octopus Energy');
    next();
    type('Total on the bill', '96.50');
    next();
    type('Covers from', '2023-03-01');
    type('Until', '2023-04-30');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText(/This bill is already recorded/)).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
