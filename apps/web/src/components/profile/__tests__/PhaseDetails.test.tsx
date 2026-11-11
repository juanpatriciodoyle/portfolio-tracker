import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCalendarDate } from '../../../lib/money';
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
    onUpdateCost: vi.fn().mockResolvedValue(ok),
    onDeleteCost: vi.fn().mockResolvedValue(ok),
    billing: makeBilling(),
    announce: vi.fn(),
    ...overrides,
  };
  const view = render(<PhaseDetails {...props} />);
  return { props, ...view };
}

describe('managing the bills of a home', () => {
  it('offers "Manage bills & documents" and no way to add costs from the card: that is one action for the whole page', () => {
    renderDetails();

    expect(screen.getAllByRole('button', { name: /Manage bills & documents/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Add an expense|Add a cost|Add a bill|Log a bill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Your bills|Bills received/i })).not.toBeInTheDocument();
  });

  it('is hidden where bills are not available', () => {
    renderDetails({ billing: undefined });

    expect(screen.queryByRole('button', { name: /Manage bills & documents/ })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));

    const input = screen.getByLabelText('Choose bill PDFs') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: [pdf('enero.pdf'), pdf('febrero.pdf')] } });

    expect(screen.getByRole('dialog', { name: 'Add bills from PDFs' })).toBeInTheDocument();
    expect(screen.getByText('Bill 1 of 2 · enero.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Manage bills and documents' })).not.toBeInTheDocument();
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

describe('ending a subscription', () => {
  const subscription = makeCost({ id: 'c9', category: 'SUBSCRIPTIONS', label: 'Netflix', amountMinor: 1299 });
  const withSubscription = (cost = subscription, monthly = 1299) => ({
    phase: makePhase({ fixedCosts: [cost] }),
    entry: makeEntry({
      fixedCostsByCategoryMinor: { RENT: 0, ELECTRICITY: 0, GAS: 0, WATER: 0, HEATING_COOLING: 0, INTERNET: 0, PHONE: 0, SUBSCRIPTIONS: monthly, TAXES: 0, OTHER: 0 },
    }),
  });

  it('asks for the last day, starting from today, and sends only the end date', async () => {
    const { props } = renderDetails(withSubscription());

    fireEvent.click(screen.getByRole('button', { name: /End subscription Subscriptions Netflix|End Subscriptions Netflix/i }));
    const day = screen.getByLabelText('Last day');
    expect(day).toHaveValue('2026-10-31');
    fireEvent.change(day, { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'End subscription' }));

    await waitFor(() => expect(props.onUpdateCost).toHaveBeenCalledWith('p1', 'c9', { endDate: '2026-09-30' }));
    expect(props.onDeleteCost).not.toHaveBeenCalled();
  });

  it('keeps an ended cost listed, marked as ended, and out of the monthly figure', () => {
    renderDetails(withSubscription(makeCost({ ...subscription, endDate: '2026-03-31' }), 0));

    const row = screen.getByText('Subscriptions').closest('li') as HTMLElement;
    expect(within(row).getByText(`Ended ${formatCalendarDate('2026-03-31')}`)).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /End subscription/i })).not.toBeInTheDocument();
  });

  it('can leave without ending it', () => {
    const { props } = renderDetails(withSubscription());

    fireEvent.click(screen.getByRole('button', { name: /End subscription/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    expect(props.onUpdateCost).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Last day')).not.toBeInTheDocument();
  });
});
