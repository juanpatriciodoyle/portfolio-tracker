import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCost, makeEntry, makePhase } from '../../../test/fixtures';
import LivingPhaseCard from '../LivingPhaseCard';

const ok = { ok: true as const, value: undefined };

function renderCard(overrides: Partial<React.ComponentProps<typeof LivingPhaseCard>> = {}) {
  const props: React.ComponentProps<typeof LivingPhaseCard> = {
    phase: makePhase({
      fixedCosts: [
        makeCost({ id: 'c1', label: 'Landlord' }),
        makeCost({ id: 'c2', category: 'WATER', cadence: 'BIMONTHLY', amountMinor: 4200 }),
      ],
    }),
    entry: makeEntry(),
    expanded: false,
    compareSelected: false,
    onToggleExpanded: vi.fn(),
    onToggleCompare: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(ok),
    onUpdatePhase: vi.fn().mockResolvedValue(ok),
    onAddCost: vi.fn().mockResolvedValue(ok),
    onUpdateCost: vi.fn().mockResolvedValue(ok),
    onDeleteCost: vi.fn().mockResolvedValue(ok),
    announce: vi.fn(),
    ...overrides,
  };
  const view = render(<LivingPhaseCard {...props} />);
  return { props, ...view };
}

describe('LivingPhaseCard at a glance', () => {
  it('shows the home, its dates, its status and what is left each month', () => {
    const { container } = renderCard();

    expect(screen.getByRole('heading', { level: 3, name: 'Madrid' })).toBeInTheDocument();
    expect(screen.getByText('Sep 2022 – now')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€1,700 left each month');
  });

  it('shows the street address as a quiet subtitle, outside the title', () => {
    const { container } = renderCard({ phase: makePhase({ address: 'Calle Mayor 1' }) });

    expect(container.querySelector('.phase-card__address')).toHaveTextContent('Calle Mayor 1');
    expect(screen.getByRole('heading', { level: 3 })).not.toHaveTextContent('Calle Mayor');
  });

  it('has no subtitle without an address', () => {
    const { container } = renderCard();

    expect(container.querySelector('.phase-card__address')).not.toBeInTheDocument();
  });

  it('leads with ratios, not raw income and cost figures', () => {
    const { container } = renderCard();

    expect(container.querySelector('[data-ratio="saved"]')).toHaveTextContent('Saved53%');
    // €1,200 rent + €150 electricity + €50 water of €3,200
    expect(container.querySelector('[data-ratio="housing"]')).toHaveTextContent('Housing44%');
    expect(container.querySelector<HTMLElement>('[data-ratio="saved"] .phase-bar__fill')?.style.width).toBe('53.125%');
    expect(screen.queryByText('Income')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixed costs')).not.toBeInTheDocument();
    expect(screen.queryByText('€3,200')).not.toBeInTheDocument();
  });

  it('says so, in red, when fixed costs exceed income', () => {
    const { container } = renderCard({
      entry: makeEntry({ savingsCapacityMinor: -15000, savingsRate: -0.05, monthlyFixedCostsMinor: 335000 }),
    });

    const leftover = container.querySelector('.phase-card__leftover');
    expect(leftover).toHaveTextContent('€150 short each month');
    expect(leftover).toHaveClass('is-negative');
    expect(container.querySelector('[data-ratio="saved"]')).toHaveTextContent('Over budget5% of income');
    expect(container.querySelector('[data-ratio="saved"] .phase-bar__fill')).toHaveClass('phase-bar__fill--loss');
  });

  it('leaves the ratios out when there is no income to compare with', () => {
    const { container } = renderCard({ entry: makeEntry({ savingsRate: null, monthlyIncomeMinor: 0 }) });

    expect(container.querySelector('[data-ratio]')).not.toBeInTheDocument();
  });

  it('marks an upcoming home as open-ended', () => {
    renderCard({
      phase: makePhase({ startDate: '2027-03-01' }),
      entry: makeEntry({ status: 'upcoming', startDate: '2027-03-01', months: 0 }),
    });

    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText(/Mar 2027 – open/)).toBeInTheDocument();
  });

  it('still renders before the timeline numbers arrive', () => {
    const { container } = renderCard({ entry: undefined });

    expect(screen.getByRole('heading', { level: 3, name: 'Madrid' })).toBeInTheDocument();
    expect(container.querySelector('[data-ratio]')).not.toBeInTheDocument();
  });
});

describe('LivingPhaseCard expanding and comparing', () => {
  it('starts collapsed and hides its details from assistive technology', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Madrid' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Fixed costs' })).not.toBeInTheDocument();
  });

  it('asks to expand when the title is pressed', () => {
    const { props } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Madrid' }));

    expect(props.onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('opens up to a breakdown by category, with utilities together and unused categories left out', () => {
    const { container } = renderCard({ expanded: true });

    expect(screen.getByRole('button', { name: 'Madrid' })).toHaveAttribute('aria-expanded', 'true');
    const rows = [...container.querySelectorAll('.phase-breakdown__row')].map((row) => row.textContent);
    expect(rows).toEqual(['RentMonthly€1,200', 'Electricity€150', 'WaterEvery 2 months€50', 'Internet€50', 'Subscriptions€50']);
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('says how long the person lived there and what they earned and paid', () => {
    renderCard({ expanded: true });

    expect(screen.getByText('Time here').nextElementSibling).toHaveTextContent('1 year 2 months');
    expect(screen.getByText('Earned').nextElementSibling).toHaveTextContent('€44,800');
    expect(screen.getByText('Fixed costs paid').nextElementSibling).toHaveTextContent('€21,000');
  });

  it('invites the first bill when there are none', () => {
    const nothing = { RENT: 0, ELECTRICITY: 0, GAS: 0, WATER: 0, HEATING_COOLING: 0, INTERNET: 0, PHONE: 0, SUBSCRIPTIONS: 0, TAXES: 0, OTHER: 0 };
    renderCard({
      expanded: true,
      entry: makeEntry({ monthlyFixedCostsMinor: 0, fixedCostsByCategoryMinor: nothing }),
      phase: makePhase({ fixedCosts: [] }),
    });

    expect(screen.getByText(/No fixed costs yet/)).toBeInTheDocument();
  });

  it('toggles comparison and reflects it for screen readers', () => {
    const { props, rerender } = renderCard();
    const toggle = screen.getByRole('button', { name: 'Compare' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(props.onToggleCompare).toHaveBeenCalledTimes(1);

    rerender(<LivingPhaseCard {...props} compareSelected />);
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('LivingPhaseCard costs', () => {
  it('keeps a line item to its category, its monthly figure and how often it is paid, without repeating the declared cost', () => {
    const { container } = renderCard({ expanded: true });

    const rent = container.querySelector('[data-category="RENT"]');
    expect(rent).toHaveTextContent('RentMonthly€1,200');
    expect(rent).not.toHaveTextContent('Landlord');
    expect(rent).not.toHaveTextContent('every month');
    expect(screen.queryByRole('list', { name: 'Declared Rent costs' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-category="WATER"]')).toHaveTextContent('WaterEvery 2 months€50');
  });

  it('has no separate "add a cost" or "add a bill" buttons, and no "your bills" or "bills received" sections', () => {
    renderCard({ expanded: true });

    expect(screen.queryByRole('button', { name: /Add a cost/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a bill/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/your bills/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bills received/i)).not.toBeInTheDocument();
  });

  it('edits a bill with its current values filled in', async () => {
    const { props } = renderCard({ expanded: true });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent Landlord' }));
    const amount = screen.getByLabelText('Amount each time');
    expect(amount).toHaveValue('1200');
    fireEvent.change(amount, { target: { value: '1250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(props.onUpdateCost).toHaveBeenCalledWith('p1', 'c1', {
        category: 'RENT',
        cadence: 'MONTHLY',
        amountMinor: 125000,
        label: 'Landlord',
      })
    );
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Cost updated'));
  });

  it('removes a bill only after confirming', async () => {
    const { props } = renderCard({ expanded: true });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Rent Landlord' }));
    expect(screen.getByText('Remove this cost?')).toBeInTheDocument();
    expect(props.onDeleteCost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(props.onDeleteCost).toHaveBeenCalledWith('p1', 'c1'));
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Cost removed'));
  });

  it('keeps a bill when the person changes their mind', () => {
    const { props } = renderCard({ expanded: true });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Rent Landlord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    expect(props.onDeleteCost).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove this cost?')).not.toBeInTheDocument();
  });
});

describe('LivingPhaseCard phase actions', () => {
  it('opens the editor from Edit phase', () => {
    const { props } = renderCard({ expanded: true });

    fireEvent.click(screen.getByRole('button', { name: /Edit phase/ }));

    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it('deletes the phase only after confirming, and can back out', async () => {
    const { props } = renderCard({ expanded: true });

    fireEvent.click(screen.getByRole('button', { name: /Delete phase/ }));
    expect(screen.getByText('Delete Madrid and its costs?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(props.onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Delete phase/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
  });

  it('explains a failed delete', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'not-found', message: 'gone' } });
    renderCard({ expanded: true, onDelete });

    fireEvent.click(screen.getByRole('button', { name: /Delete phase/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
  });
});
