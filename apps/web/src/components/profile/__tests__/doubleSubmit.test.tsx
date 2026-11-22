import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeStreamDto } from '../../../contracts';
import { submitTwice, tapTwice } from '../../../test/doubleTap';
import { makeBill, makeCost, makeEntry, makePhase, makeProfile } from '../../../test/fixtures';
import type { BillingView } from '../billingView';
import type { BillFormContext } from '../billForm';
import BillEditor from '../BillEditor';
import FixedCostEditor from '../FixedCostEditor';
import IncomeSection from '../IncomeSection';
import IncomeStreamEditor from '../IncomeStreamEditor';
import LivingPhaseCard from '../LivingPhaseCard';
import PhaseDetails from '../PhaseDetails';
import ProfileForm from '../ProfileForm';

const ok = { ok: true as const, value: undefined };
const formOf = (button: HTMLElement) => button.closest('form');

describe('tapping twice saves once: the editors', () => {
  it('a declared cost', async () => {
    const onSubmit = vi.fn().mockResolvedValue(ok);
    render(<FixedCostEditor currency="EUR" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));

    submitTwice(formOf(screen.getByRole('button', { name: 'Add cost' })));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('a bill', async () => {
    const context: BillFormContext = { today: '2026-10-31', countryCode: 'ES', history: [] };
    const onSubmit = vi.fn().mockResolvedValue(ok);
    render(<BillEditor phaseId="p1" currency="EUR" context={context} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '96,50' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));

    submitTwice(formOf(screen.getByRole('button', { name: 'Add expense' })));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('an income stream', async () => {
    const onSubmit = vi.fn().mockResolvedValue(ok);
    render(<IncomeStreamEditor phase={makePhase({ startDate: '2026-01-01', endDate: null })} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Role or source'), { target: { value: 'Salary' } });
    fireEvent.change(screen.getByLabelText('Net per month'), { target: { value: '3200' } });

    submitTwice(formOf(screen.getByRole('button', { name: 'Add income' })));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('the profile', async () => {
    const onSave = vi.fn().mockResolvedValue(ok);
    render(<ProfileForm profile={makeProfile()} onSave={onSave} announce={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Demographics & Household Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Edit|Add details)$/ }));

    submitTwice(formOf(screen.getByRole('button', { name: 'Save' })));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('and a form that was refused can be sent again', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, failure: { kind: 'unknown', message: 'offline' } })
      .mockResolvedValueOnce(ok);
    render(<FixedCostEditor currency="EUR" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));

    fireEvent.submit(formOf(screen.getByRole('button', { name: 'Add cost' }))!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add cost' })).toBeEnabled());
    fireEvent.submit(formOf(screen.getByRole('button', { name: 'Add cost' }))!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });
});

describe('tapping twice changes a job once', () => {
  const designer: IncomeStreamDto = { label: 'Designer', amountMinor: 300000, startDate: '2026-01-01', endDate: null };
  const today = '2026-06-15';
  const renderSection = (streams: IncomeStreamDto[]) => {
    const onUpdatePhase = vi.fn().mockResolvedValue(ok);
    render(<IncomeSection phase={makePhase({ startDate: '2026-01-01', incomeStreams: streams })} asOf={today} onUpdatePhase={onUpdatePhase} announce={vi.fn()} />);
    return onUpdatePhase;
  };

  it('on Remove', async () => {
    const onUpdatePhase = renderSection([designer]);
    fireEvent.click(screen.getByRole('button', { name: /Remove Designer/ }));

    tapTwice(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledTimes(1));
  });

  it('on End job', async () => {
    const onUpdatePhase = renderSection([designer]);
    fireEvent.click(screen.getByRole('button', { name: /End job Designer/ }));

    tapTwice(within(screen.getByRole('group', { name: 'End Designer' })).getByRole('button', { name: 'End job' }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledTimes(1));
  });

  it('on Bring back', async () => {
    const onUpdatePhase = renderSection([{ ...designer, endDate: '2026-03-31', endReason: 'QUIT' }]);

    tapTwice(screen.getByRole('button', { name: /Bring back Designer/ }));

    await waitFor(() => expect(onUpdatePhase).toHaveBeenCalledTimes(1));
  });
});

describe('tapping twice deletes once', () => {
  const ok2 = ok;

  it('a living phase', async () => {
    const onDelete = vi.fn().mockResolvedValue(ok2);
    render(
      <LivingPhaseCard
        phase={makePhase({ fixedCosts: [makeCost({ id: 'c1', label: 'Landlord' })] })}
        entry={makeEntry()}
        expanded
        compareSelected={false}
        onToggleExpanded={vi.fn()}
        onToggleCompare={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onUpdatePhase={vi.fn().mockResolvedValue(ok2)}
        onUpdateCost={vi.fn().mockResolvedValue(ok2)}
        onDeleteCost={vi.fn().mockResolvedValue(ok2)}
        announce={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete phase/ }));

    tapTwice(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  describe('inside a home', () => {
    const billing = (overrides: Partial<BillingView> = {}): BillingView => ({
      asOf: '2026-10-31',
      recordsFor: () => [],
      history: [],
      onAdd: vi.fn().mockResolvedValue(ok2),
      onUpdate: vi.fn().mockResolvedValue(ok2),
      onDelete: vi.fn().mockResolvedValue(ok2),
      ...overrides,
    });

    it('a cost', async () => {
      const onDeleteCost = vi.fn().mockResolvedValue(ok2);
      render(
        <PhaseDetails phase={makePhase({ fixedCosts: [makeCost({ id: 'c1', label: 'Landlord' })] })} entry={makeEntry()} onUpdateCost={vi.fn()} onDeleteCost={onDeleteCost} billing={billing()} announce={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Remove Rent Landlord' }));

      tapTwice(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(onDeleteCost).toHaveBeenCalledTimes(1));
    });

    it('the end of a subscription', async () => {
      const onUpdateCost = vi.fn().mockResolvedValue(ok2);
      const subscription = makeCost({ id: 'c9', category: 'SUBSCRIPTIONS', label: 'Netflix', amountMinor: 1299 });
      render(<PhaseDetails phase={makePhase({ fixedCosts: [subscription] })} entry={makeEntry()} onUpdateCost={onUpdateCost} onDeleteCost={vi.fn()} billing={billing()} announce={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /End subscription Subscriptions Netflix|End Subscriptions Netflix/i }));
      fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-30' } });

      tapTwice(screen.getByRole('button', { name: 'End subscription' }));

      await waitFor(() => expect(onUpdateCost).toHaveBeenCalledTimes(1));
    });

    it('a bill', async () => {
      const records = [makeBill({ id: 'b2', vendor: 'Endesa', category: 'GAS', cadence: 'MONTHLY', periodStart: '2026-09-15', periodEnd: '2026-10-14', amountMinor: 4000 })];
      const onDelete = vi.fn().mockResolvedValue(ok2);
      render(<PhaseDetails phase={makePhase()} entry={makeEntry()} onUpdateCost={vi.fn()} onDeleteCost={vi.fn()} billing={billing({ recordsFor: () => records, onDelete })} announce={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /Manage bills & documents/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove Gas bill from Endesa' }));

      tapTwice(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    });
  });
});
