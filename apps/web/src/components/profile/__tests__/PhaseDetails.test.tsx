import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBill, makeCost, makeEntry, makePhase, noBasis } from '../../../test/fixtures';
import { createMemoryStorage } from '../../../test/memoryStorage';
import type { BillingView } from '../billingView';
import PhaseDetails from '../PhaseDetails';

const ok = { ok: true as const, value: undefined };

function makeBilling(overrides: Partial<BillingView> = {}): BillingView {
  return {
    asOf: '2026-10-31',
    recordsFor: () => [],
    history: [],
    onAdd: vi.fn().mockResolvedValue(ok),
    onUpdate: vi.fn().mockResolvedValue(ok),
    onDelete: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
}

function renderDetails(overrides: Partial<React.ComponentProps<typeof PhaseDetails>> = {}) {
  const props: React.ComponentProps<typeof PhaseDetails> = {
    phase: makePhase({ fixedCosts: [makeCost({ id: 'c1', label: 'Landlord' })] }),
    entry: makeEntry(),
    onUpdatePhase: vi.fn().mockResolvedValue(ok),
    onAddCost: vi.fn().mockResolvedValue(ok),
    onUpdateCost: vi.fn().mockResolvedValue(ok),
    onDeleteCost: vi.fn().mockResolvedValue(ok),
    billing: makeBilling(),
    announce: vi.fn(),
    ...overrides,
  };
  const view = render(<PhaseDetails {...props} />);
  return { props, ...view };
}

describe('the one place to add an expense', () => {
  it('offers a single "Add an expense" and a "Manage bills & documents", and nothing else for adding costs', () => {
    renderDetails();

    expect(screen.getAllByRole('button', { name: /Add an expense/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Manage bills & documents/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Add a cost/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a bill|Log a bill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Your bills|Bills received/i })).not.toBeInTheDocument();
  });

  it('is hidden where bills are not available', () => {
    renderDetails({ billing: undefined });

    expect(screen.queryByRole('button', { name: /Add an expense/ })).not.toBeInTheDocument();
  });

  it('opens a dialog, preselects the category from the sender, and logs the expense', async () => {
    const billing = makeBilling();
    const { props } = renderDetails({ billing });
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    const dialog = screen.getByRole('dialog', { name: 'Add an expense' });
    fireEvent.change(within(dialog).getByLabelText('Who sent it?'), { target: { value: 'Netflix' } });
    expect(within(dialog).getByRole('radio', { name: 'Subscriptions' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Monthly' })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText('Total on the bill'), { target: { value: '12.99' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(billing.onAdd).toHaveBeenCalledWith({
        phaseId: 'p1',
        category: 'SUBSCRIPTIONS',
        cadence: 'MONTHLY',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        amountMinor: 1299,
        vendor: 'Netflix',
      })
    );
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Expense added'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('recognises a sender the person already has, in the same home or another', () => {
    renderDetails({ billing: makeBilling({ history: [{ vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' }] }) });
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Octopus Energy' } });

    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
  });

  it('closes with Cancel and keeps nothing', () => {
    const billing = makeBilling();
    renderDetails({ billing });
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(billing.onAdd).not.toHaveBeenCalled();
  });
});

describe('adding a fixed rate from the same button', () => {
  const openRate = () => {
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Recurring fixed rate' }));
  };

  it('starts on a single bill receipt and offers the recurring fixed rate as the other choice', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    expect(screen.getByRole('radio', { name: 'Single bill receipt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Recurring fixed rate' })).not.toBeChecked();
    expect(screen.getByLabelText('Covers from')).toBeInTheDocument();
  });

  it('saves a new subscription as a declared cost, with an amount and a cadence and no bill period', async () => {
    const { props } = renderDetails();
    openRate();

    expect(screen.queryByLabelText('Covers from')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Subscriptions' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '9,99' } });
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Spotify' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    await waitFor(() => expect(props.onAddCost).toHaveBeenCalledWith('p1', { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: 999, label: 'Spotify' }));
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Cost added'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.billing?.onAdd).not.toHaveBeenCalled();
  });

  it('offers only the fixed categories: the ones whose bill changes every time are logged as receipts', () => {
    renderDetails();
    openRate();

    const offered = screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));
    expect(offered).toEqual(expect.arrayContaining(['RENT', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS', 'OTHER']));
    for (const variable of ['ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING', 'TAXES']) expect(offered).not.toContain(variable);
  });

  it('suggests the category and cadence from the label typed, until the person picks their own', () => {
    renderDetails();
    openRate();

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Netflix' } });
    expect(screen.getByRole('radio', { name: 'Subscriptions' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Digi' } });
    expect(screen.getByRole('radio', { name: 'Other' })).toBeChecked();
  });

  it('renews the declared cost of the same name instead of adding a second one', async () => {
    const { props } = renderDetails({
      phase: makePhase({ fixedCosts: [makeCost({ id: 'net', category: 'SUBSCRIPTIONS', label: 'Netflix', amountMinor: 1299 })] }),
    });
    openRate();

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'netflix' } });
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '17.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    await waitFor(() => expect(props.onUpdateCost).toHaveBeenCalledWith('p1', 'net', { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: 1799, label: 'netflix' }));
    expect(props.onAddCost).not.toHaveBeenCalled();
    expect(props.announce).toHaveBeenCalledWith('Cost updated');
  });

  it('adds a second cost when the name is different, or when the same name is in another category', async () => {
    const { props } = renderDetails({
      phase: makePhase({ fixedCosts: [makeCost({ id: 'net', category: 'SUBSCRIPTIONS', label: 'Netflix', amountMinor: 1299 })] }),
    });
    openRate();

    fireEvent.click(screen.getByRole('radio', { name: 'Internet' }));
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Netflix' } });
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    await waitFor(() => expect(props.onAddCost).toHaveBeenCalledWith('p1', expect.objectContaining({ category: 'INTERNET', amountMinor: 3000 })));
    expect(props.onUpdateCost).not.toHaveBeenCalled();
  });

  it('asks for the category and the amount, and keeps the dialog open with the reason when saving fails', async () => {
    const onAddCost = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    renderDetails({ onAddCost });
    openRate();

    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));
    expect(screen.getByText('Pick what this bill is for.')).toBeInTheDocument();
    expect(onAddCost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring cost' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add an expense' })).toBeInTheDocument();
  });

  it('still logs a utility as a dated bill from the receipt side', async () => {
    const { props } = renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(props.billing?.onAdd).toHaveBeenCalledWith(expect.objectContaining({ category: 'ELECTRICITY', cadence: 'MONTHLY', amountMinor: 8000 })));
    expect(props.onAddCost).not.toHaveBeenCalled();
  });

  it('keeps the PDF drop zone for receipts, since a PDF is always a dated bill', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));
    expect(screen.getByLabelText('Choose bill PDFs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Recurring fixed rate' }));
    expect(screen.queryByLabelText('Choose bill PDFs')).not.toBeInTheDocument();
  });
});

describe('the monthly breakdown', () => {
  it('puts the categories in order: rent, utilities, internet and phone, subscriptions, taxes, other', () => {
    const { container } = renderDetails({
      phase: makePhase({ fixedCosts: [] }),
      entry: makeEntry({
        fixedCostsByCategoryMinor: { RENT: 100, ELECTRICITY: 200, GAS: 300, WATER: 400, HEATING_COOLING: 500, INTERNET: 600, PHONE: 700, SUBSCRIPTIONS: 800, TAXES: 900, OTHER: 1000 },
      }),
    });

    const names = [...container.querySelectorAll('.phase-breakdown__name')].map((name) => name.firstChild?.textContent);
    expect(names).toEqual(['Rent', 'Electricity', 'Gas', 'Water', 'Heating / cooling', 'Internet', 'Phone', 'Subscriptions', 'Taxes', 'Other']);
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('keeps where a number comes from out of sight, in a tooltip', () => {
    const { container } = renderDetails({
      entry: makeEntry({
        costBasisByCategory: noBasis({ ELECTRICITY: { basis: 'BILLS', billCount: 3 }, INTERNET: { basis: 'BILLS', billCount: 2 } }),
      }),
    });

    expect(screen.queryByText('Average of 3 bills')).not.toBeInTheDocument();
    expect(screen.queryByText('From your latest 2 bills')).not.toBeInTheDocument();
    expect(container.querySelector('[data-category="ELECTRICITY"] .phase-breakdown__row')).toHaveAttribute('title', 'Average of 3 bills');
    expect(container.querySelector('[data-category="INTERNET"] .phase-breakdown__row')).toHaveAttribute('title', 'From your latest 2 bills');
  });

  it('crosses out a declared cost the bills have replaced, without hiding it', () => {
    renderDetails({
      phase: makePhase({ fixedCosts: [makeCost({ id: 'c9', category: 'INTERNET', label: 'Fibre', amountMinor: 3000 })] }),
      entry: makeEntry({ costBasisByCategory: noBasis({ INTERNET: { basis: 'BILLS', billCount: 3 } }) }),
    });

    const row = within(screen.getByRole('list', { name: 'Declared Internet costs' })).getByRole('listitem');
    expect(row).toHaveClass('is-replaced');
    expect(row).toHaveAttribute('title', 'Replaced by your bills');
    expect(row).not.toHaveTextContent('replaced by your bills');
  });

  it('never says "every year" next to a tax, and names the cadence of other yearly costs', () => {
    const { container } = renderDetails({
      phase: makePhase({
        fixedCosts: [
          makeCost({ id: 't1', category: 'TAXES', cadence: 'ANNUAL', amountMinor: 36000, label: 'IBI' }),
          makeCost({ id: 's1', category: 'SUBSCRIPTIONS', cadence: 'ANNUAL', amountMinor: 12000, label: 'Dropbox' }),
        ],
      }),
      entry: makeEntry({ fixedCostsByCategoryMinor: { ...makeEntry().fixedCostsByCategoryMinor, TAXES: 3000 } }),
    });

    const taxes = container.querySelector('[data-category="TAXES"]');
    expect(taxes).toHaveTextContent('Taxes€30');
    expect(taxes).not.toHaveTextContent(/year|Yearly/);
    expect(container.querySelector('[data-category="SUBSCRIPTIONS"]')).toHaveTextContent('SubscriptionsYearly');
  });

  it('still lets a declared cost be edited and removed', async () => {
    const { props } = renderDetails();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent Landlord' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '1250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(props.onUpdateCost).toHaveBeenCalledWith('p1', 'c1', expect.objectContaining({ amountMinor: 125000 })));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Rent Landlord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(props.onDeleteCost).toHaveBeenCalledWith('p1', 'c1'));
  });

  it('keeps edit and remove buttons in the page for keyboard users, whatever the hover', () => {
    renderDetails();

    const row = screen.getByRole('button', { name: 'Edit Rent Landlord' }).closest('.phase-breakdown__row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.cost-row__actions')).toContainElement(screen.getByRole('button', { name: 'Remove Rent Landlord' }));
  });
});

describe('manage bills & documents', () => {
  const records = [
    makeBill({ id: 'b1', vendor: 'Iberdrola', periodEnd: '2026-09-14' }),
    makeBill({ id: 'b2', vendor: 'Endesa', category: 'GAS', cadence: 'MONTHLY', periodStart: '2026-09-15', periodEnd: '2026-10-14', amountMinor: 4000 }),
  ];

  it('lists every bill logged, newest first, in a dialog of its own', () => {
    renderDetails({ billing: makeBilling({ recordsFor: () => records }) });

    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    const list = within(screen.getByRole('dialog', { name: 'Manage bills and documents' })).getByRole('list', { name: 'Bills received' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Endesa');
    expect(items[1]).toHaveTextContent('Iberdrola');
    expect(items[1]).toHaveTextContent('€96 every 2 months');
  });

  it('corrects a bill from its row', async () => {
    const billing = makeBilling({ recordsFor: () => records });
    const { props } = renderDetails({ billing });
    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Electricity bill from Iberdrola' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(billing.onUpdate).toHaveBeenCalledWith('b1', expect.objectContaining({ amountMinor: 9900, vendor: 'Iberdrola' })));
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Bill updated'));
  });

  it('removes a bill only after confirming', async () => {
    const billing = makeBilling({ recordsFor: () => records });
    renderDetails({ billing });
    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Gas bill from Endesa' }));
    expect(billing.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(billing.onDelete).toHaveBeenCalledWith('b2'));
  });

  it('invites the first bill when there are none', () => {
    renderDetails();

    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    expect(screen.getByText(/No bills yet/)).toBeInTheDocument();
  });
});

describe('adding bills from PDFs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'tok' }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const pdf = (name: string) => new File([new Uint8Array(10)], name, { type: 'application/pdf' });

  it('accepts several PDFs picked at once and reviews them one after another', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Add an expense/ }));

    const input = screen.getByLabelText('Choose bill PDFs') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: [pdf('enero.pdf'), pdf('febrero.pdf')] } });

    expect(screen.getByRole('dialog', { name: 'Add bills from PDFs' })).toBeInTheDocument();
    expect(screen.getByText('Bill 1 of 2 · enero.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add an expense' })).not.toBeInTheDocument();
  });

  it('accepts PDFs dropped onto the drop zone, and ignores other files', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    const zone = screen.getByText(/Have the PDFs\?/).closest('.pdf-picker') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [pdf('a.pdf'), new File(['x'], 'photo.png', { type: 'image/png' }), pdf('b.pdf')] } });

    expect(screen.getByText('Bill 1 of 2 · a.pdf')).toBeInTheDocument();
  });

  it('does nothing when only other kinds of file are dropped', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    const zone = screen.getByText(/Have the PDFs\?/).closest('.pdf-picker') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } });

    expect(screen.queryByRole('dialog', { name: /from PDFs?|from a PDF/ })).not.toBeInTheDocument();
  });
});
