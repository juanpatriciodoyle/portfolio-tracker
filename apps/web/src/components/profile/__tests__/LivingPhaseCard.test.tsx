import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    onUpdateCost: vi.fn().mockResolvedValue(ok),
    onDeleteCost: vi.fn().mockResolvedValue(ok),
    announce: vi.fn(),
    ...overrides,
  };
  const view = render(<LivingPhaseCard {...props} />);
  return { props, ...view };
}

describe('LivingPhaseCard compare', () => {
  it('has no Compare button when there is nothing to compare with', () => {
    renderCard({ onToggleCompare: undefined });
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
  });
});

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

    expect(container.querySelector('[data-ratio="saved"]')).toHaveTextContent('Left after fixed costs53%');
    // €1,200 rent + €150 electricity + €50 water of €3,200
    expect(container.querySelector('[data-ratio="housing"]')).toHaveTextContent('Housing44%');
    expect(container.querySelector<HTMLElement>('[data-ratio="saved"] .phase-bar__fill')?.style.width).toBe('53.125%');
    const metrics = container.querySelector('.phase-card__metrics') as HTMLElement;
    expect(within(metrics).queryByText('Income')).not.toBeInTheDocument();
    expect(within(metrics).queryByText('Fixed costs')).not.toBeInTheDocument();
    expect(within(metrics).queryByText('€3,200')).not.toBeInTheDocument();
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

  it('shows a burn rate instead of a percentage when nothing comes in', () => {
    const { container } = renderCard({
      phase: makePhase({ incomeStreams: [] }),
      entry: makeEntry({
        monthlyIncomeMinor: 0,
        savingsCapacityMinor: -150000,
        savingsRate: null,
        averageMonthlyIncomeMinor: 0,
        averageSavingsCapacityMinor: -150000,
        averageSavingsRate: null,
      }),
    });

    expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€1,500 short each month');
    expect(container.querySelector('[data-chip="burn"]')).toHaveTextContent('Burn rate: -€1,500/mo');
    expect(container.querySelector('[data-ratio]')).not.toBeInTheDocument();
  });

  it('shows no burn chip while there is income, even when it is not enough', () => {
    const { container } = renderCard({ entry: makeEntry({ savingsCapacityMinor: -15000, savingsRate: -0.05 }) });

    expect(container.querySelector('[data-chip="burn"]')).not.toBeInTheDocument();
  });

  describe('current rate and phase average', () => {
    const entry = makeEntry({
      monthlyIncomeMinor: 400000,
      savingsCapacityMinor: 250000,
      savingsRate: 0.625,
      averageMonthlyIncomeMinor: 200000,
      averageSavingsCapacityMinor: 50000,
      averageSavingsRate: 0.25,
    });

    it('starts on the current rate', () => {
      const { container } = renderCard({ entry });

      expect(screen.getByRole('radio', { name: 'Current rate' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Phase average' })).not.toBeChecked();
      expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€2,500 left each month');
      expect(container.querySelector('[data-ratio="saved"]')).toHaveTextContent('Left after fixed costs63%');
    });

    it('switches the leftover, the saved share and the housing share to the average month of the stay', () => {
      const { container } = renderCard({ entry });

      fireEvent.click(screen.getByRole('radio', { name: 'Phase average' }));

      expect(screen.getByRole('radio', { name: 'Phase average' })).toBeChecked();
      expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€500 left each month');
      expect(container.querySelector('[data-ratio="saved"]')).toHaveTextContent('Left after fixed costs25%');
      // €1,400 of rent and utilities over an average income of €2,000
      expect(container.querySelector('[data-ratio="housing"]')).toHaveTextContent('Housing70%');

      fireEvent.click(screen.getByRole('radio', { name: 'Current rate' }));
      expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€2,500 left each month');
    });

    it('keeps each card on its own choice', () => {
      renderCard({ entry });
      fireEvent.click(screen.getByRole('radio', { name: 'Phase average' }));

      expect(screen.getAllByRole('radiogroup', { name: 'Income shown' })).toHaveLength(1);
    });
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

  it('says how long the person lived there, and never a total earned or paid: those were extrapolations shown as fact', () => {
    renderCard({ expanded: true });

    expect(screen.getByText('Time here').nextElementSibling).toHaveTextContent('1 year 2 months');
    expect(screen.queryByText('Earned')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixed costs paid')).not.toBeInTheDocument();
    expect(screen.queryByText('€44,800')).not.toBeInTheDocument();
  });

  it('shows no cost rows and no hint when there are no costs', () => {
    const nothing = { RENT: 0, ELECTRICITY: 0, GAS: 0, WATER: 0, HEATING_COOLING: 0, INTERNET: 0, PHONE: 0, SUBSCRIPTIONS: 0, TAXES: 0, OTHER: 0 };
    renderCard({
      expanded: true,
      entry: makeEntry({ monthlyFixedCostsMinor: 0, fixedCostsByCategoryMinor: nothing }),
      phase: makePhase({ fixedCosts: [] }),
    });

    expect(screen.queryByText(/No fixed costs yet/)).not.toBeInTheDocument();
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

describe('LivingPhaseCard trend', () => {
  const bill = (category: 'INTERNET' | 'GAS', month: string, amountMinor: number) => {
    const last = new Date(Date.UTC(2026, Number(month.slice(5)), 0)).getUTCDate();
    return {
      id: `${category}-${month}`,
      phaseId: 'p1',
      category,
      cadence: 'MONTHLY' as const,
      periodStart: `${month}-01`,
      periodEnd: `${month}-${last}`,
      amountMinor,
      vendor: 'Vendor',
      notes: null,
      currency: 'EUR',
    };
  };
  const billingWith = (records: ReturnType<typeof bill>[]) =>
    ({ asOf: '2026-11-15', phases: [], recordsFor: () => records, history: [], onAdd: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() }) as NonNullable<React.ComponentProps<typeof LivingPhaseCard>['billing']>;
  const earlier = ['2026-05', '2026-06', '2026-07'];
  const recent = ['2026-08', '2026-09', '2026-10'];

  it('says the bills rose, by how much since which month, and what most of it is', () => {
    const records = [...earlier.map((m) => bill('INTERNET', m, 4000)), ...recent.map((m) => bill('INTERNET', m, 7700))];
    const { container } = renderCard({ billing: billingWith(records) });

    expect(container.querySelector('.phase-card__trend')).toHaveTextContent('Your bills rose €37 a month since August. Internet is most of it.');
  });

  it('says nothing when the bills hardly moved, or there are too few to say', () => {
    const steady = [...earlier, ...recent].map((m) => bill('INTERNET', m, 4000));
    expect(renderCard({ billing: billingWith(steady) }).container.querySelector('.phase-card__trend')).not.toBeInTheDocument();
    const few = [bill('GAS', '2026-06', 3000), bill('GAS', '2026-09', 9000)];
    expect(renderCard({ billing: billingWith(few) }).container.querySelector('.phase-card__trend')).not.toBeInTheDocument();
  });

  it('compares what is kept with the previous home when the bills say nothing new', () => {
    const previousEntry = makeEntry({ phaseId: 'p0', name: 'Barcelona', savingsRate: 0.4, averageSavingsRate: 0.4 });
    const { container } = renderCard({ previousEntry });

    expect(container.querySelector('.phase-card__trend')).toHaveTextContent('You keep 53% after fixed costs, up from 40% in Barcelona.');
  });

  it('follows the figures the card shows: the average of the stay when that view is chosen', () => {
    const previousEntry = makeEntry({ phaseId: 'p0', name: 'Barcelona', savingsRate: 0.5, averageSavingsRate: 0.3 });
    const entry = makeEntry({ savingsRate: 0.53125, averageSavingsRate: 0.34, averageMonthlyIncomeMinor: 280000, averageSavingsCapacityMinor: 130000 });
    const { container } = renderCard({ previousEntry, entry });

    fireEvent.click(screen.getByRole('radio', { name: /Phase average/ }));

    // 34% against 30% is under 5 points: nothing to say.
    expect(container.querySelector('.phase-card__trend')).not.toBeInTheDocument();
  });

  it('says nothing without income to take a share of', () => {
    const previousEntry = makeEntry({ phaseId: 'p0', name: 'Barcelona', savingsRate: 0.4 });
    const { container } = renderCard({ previousEntry, entry: makeEntry({ monthlyIncomeMinor: 0, savingsRate: null, averageSavingsRate: null }) });

    expect(container.querySelector('.phase-card__trend')).not.toBeInTheDocument();
  });
});

describe('LivingPhaseCard income & career', () => {
  const stream = (label: string, amountMinor: number, startDate: string, endDate: string | null = null) => ({ label, amountMinor, startDate, endDate });
  const asOf = { asOf: '2026-10-31', recordsFor: () => [] } as unknown as NonNullable<React.ComponentProps<typeof LivingPhaseCard>['billing']>;

  it('says which job pays today, without opening the card', () => {
    renderCard({ phase: makePhase({ incomeStreams: [stream('Designer', 320000, '2022-09-01')] }), billing: asOf });
    expect(screen.getByText('Designer · €3,200/mo')).toBeInTheDocument();
  });

  it('says there is no income right now, and since when, once every job has ended', () => {
    renderCard({ phase: makePhase({ incomeStreams: [stream('Designer', 320000, '2022-09-01', '2026-06-30')] }), billing: asOf });
    expect(screen.getByText(/^No income right now · since .*2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Sabbatical/)).not.toBeInTheDocument();
  });

  it('counts the jobs when several pay at once, and keeps the other when one ends', () => {
    const jobs = [stream('Designer', 320000, '2022-09-01'), stream('Consulting', 80000, '2024-01-01')];
    const { unmount } = renderCard({ phase: makePhase({ incomeStreams: jobs }), billing: asOf });
    expect(screen.getByText('2 jobs · €4,000/mo')).toBeInTheDocument();
    unmount();
    renderCard({ phase: makePhase({ incomeStreams: [jobs[0], { ...jobs[1], endDate: '2026-06-30' }] }), billing: asOf });
    expect(screen.getByText('Designer · €3,200/mo')).toBeInTheDocument();
  });

  it('shows the current job as a visible row with a real "Add job" button, not a tiny link pair', () => {
    renderCard({ phase: makePhase({ incomeStreams: [stream('Designer', 320000, '2022-09-01')] }), billing: asOf });

    expect(screen.getByText('Designer · €3,200/mo')).toBeVisible();
    const add = screen.getByRole('button', { name: 'Add job' });
    expect(add).toBeVisible();
    expect(add).toHaveClass('profile-action-button');
    expect(screen.getByRole('button', { name: /Income & Career/ })).not.toHaveTextContent('Add');
  });

  it('opens the income list with the form to add a job already open', () => {
    renderCard({ phase: makePhase({ incomeStreams: [stream('Designer', 320000, '2022-09-01')] }), billing: asOf });
    expect(screen.queryByRole('list', { name: 'Paying now' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add job' }));

    expect(screen.getByRole('button', { name: /Income & Career/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/^Role/)).toBeInTheDocument();
  });

  it('opens the income list from an always-visible trigger, and closes it again', () => {
    renderCard({ phase: makePhase({ incomeStreams: [stream('Designer', 320000, '2022-09-01')] }), billing: asOf });
    const trigger = screen.getByRole('button', { name: /Income & Career/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Paying now' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Paying now' })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('list', { name: 'Paying now' })).not.toBeInTheDocument();
  });
});

describe('LivingPhaseCard income views', () => {
  it('offers the choice between today’s rate and the average only when they say different things', () => {
    renderCard({ entry: makeEntry({ monthlyIncomeMinor: 340000, averageMonthlyIncomeMinor: 316000 }) });

    expect(screen.getByRole('radio', { name: /Phase average/ })).toBeInTheDocument();
    expect(screen.queryByText(/pay has been steady/)).not.toBeInTheDocument();
  });

  it('says the pay has been steady instead of showing a control that changes nothing', () => {
    renderCard({ entry: makeEntry({ monthlyIncomeMinor: 340000, averageMonthlyIncomeMinor: 340000 }) });

    expect(screen.queryByRole('radio', { name: /Phase average/ })).not.toBeInTheDocument();
    expect(screen.getByText('Your pay has been steady, so today’s rate is also your average.')).toBeInTheDocument();
  });

  it('shows neither with no income at all', () => {
    renderCard({ entry: makeEntry({ monthlyIncomeMinor: 0, averageMonthlyIncomeMinor: 0, savingsRate: null, averageSavingsRate: null }) });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/pay has been steady/)).not.toBeInTheDocument();
  });

  it('really changes the figures when the average is chosen', () => {
    const { container } = renderCard({
      entry: makeEntry({ monthlyIncomeMinor: 340000, averageMonthlyIncomeMinor: 316000, savingsCapacityMinor: 190000, averageSavingsCapacityMinor: 166000 }),
    });
    expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€1,900');

    fireEvent.click(screen.getByRole('radio', { name: /Phase average/ }));

    expect(container.querySelector('.phase-card__leftover')).toHaveTextContent('€1,660');
  });
});

describe('LivingPhaseCard bills & costs', () => {
  const billing = { asOf: '2026-10-31', recordsFor: () => [], history: [], onAdd: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() } as unknown as NonNullable<
    React.ComponentProps<typeof LivingPhaseCard>['billing']
  >;

  it('has one "Bills & costs" button on the card itself, with the card collapsed', () => {
    renderCard({ billing, expanded: false });

    expect(screen.getAllByRole('button', { name: 'Bills & costs' })).toHaveLength(1);
    expect(screen.getByText('Costs €1,500 a month')).toBeInTheDocument();
  });

  it('is there for a home already left, not only the current one', () => {
    renderCard({ billing, phase: makePhase({ startDate: '2021-02-01', endDate: '2023-02-28' }), entry: makeEntry({ status: 'past', endDate: '2023-02-28' }) });

    expect(screen.getByRole('button', { name: 'Bills & costs' })).toBeInTheDocument();
  });

  it('opens the costs and bills of that home', () => {
    renderCard({ billing });

    fireEvent.click(screen.getByRole('button', { name: 'Bills & costs' }));

    expect(within(screen.getByRole('dialog', { name: 'Manage bills and documents' })).getByRole('region', { name: 'Fixed costs each month' })).toHaveTextContent('€1,500');
  });

  it('is absent where bills are not available', () => {
    renderCard({ billing: undefined });

    expect(screen.queryByRole('button', { name: 'Bills & costs' })).not.toBeInTheDocument();
  });
});
