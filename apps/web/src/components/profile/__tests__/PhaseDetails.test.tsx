import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatCalendarDate } from '../../../lib/money';
import { makeCost, makeEntry, makePhase, noBasis } from '../../../test/fixtures';
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

describe('the details of a home', () => {
  it('leave bills to the card: no ledger button and no way to add costs from here', () => {
    renderDetails();

    expect(screen.queryByRole('button', { name: /Manage bills|Bills & costs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add an expense|Add a cost|Add a bill|Log a bill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Your bills|Bills received/i })).not.toBeInTheDocument();
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

  it('says where a number comes from beside its name, the same way for a declared cost and for bills', () => {
    const { container } = renderDetails({
      phase: makePhase({ fixedCosts: [makeCost({ id: 'c1', label: 'Landlord' })] }),
      entry: makeEntry({
        costBasisByCategory: noBasis({ ELECTRICITY: { basis: 'BILLS', billCount: 3 }, INTERNET: { basis: 'BILLS', billCount: 2 } }),
      }),
    });

    const noteOf = (category: string) => container.querySelector(`[data-category="${category}"] .phase-breakdown__row .phase-breakdown__note`)?.textContent;
    expect(noteOf('ELECTRICITY')).toBe('Average of 3 bills');
    expect(noteOf('INTERNET')).toBe('From your latest 2 bills');
    // A declared rent reads the same way: what it is, then what it comes from.
    expect(noteOf('RENT')).toBe('Monthly');
    expect(container.querySelector('[data-category="ELECTRICITY"] .phase-breakdown__row')).toHaveAttribute('title', 'Average of 3 bills');
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
