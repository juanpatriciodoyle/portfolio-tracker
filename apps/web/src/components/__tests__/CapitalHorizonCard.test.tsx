import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCapitalHorizon, makePacedMilestone } from '../../test/fixtures';
import CapitalHorizonCard from '../CapitalHorizonCard';

const ok = { ok: true as const, value: undefined };
const click = (element: HTMLElement) => fireEvent.click(element);
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const setup = (horizon = makeCapitalHorizon(), save = vi.fn().mockResolvedValue(ok)) => {
  render(<CapitalHorizonCard capitalHorizon={horizon} onSave={save} />);
  return { save, user: { click, type } };
};

const unset = () => makeCapitalHorizon({ milestones: [] });
const achieved = () =>
  makeCapitalHorizon({ milestones: [makePacedMilestone({ achieved: true, monthsRemaining: 0, capitalGapMinor: 0, progress: 1 })] });

describe('CapitalHorizonCard: no milestone set', () => {
  it('offers a quiet way to set one, with presets', () => {
    setup(unset());
    expect(screen.getByRole('button', { name: '+ Set a milestone target' })).toBeInTheDocument();
    for (const preset of ['Property', 'Sabbatical', 'Custom']) expect(screen.getByRole('button', { name: preset })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('treats a disabled milestone as not set', () => {
    setup(makeCapitalHorizon({ milestones: [makePacedMilestone({ enabled: false })] }));
    expect(screen.getByRole('button', { name: '+ Set a milestone target' })).toBeInTheDocument();
    expect(screen.queryByText(/months away/)).not.toBeInTheDocument();
  });

  it('opens the editor with the preset filled in, and saves an enabled milestone', async () => {
    const { user, save } = setup(unset());
    user.click(screen.getByRole('button', { name: 'Property' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Property Down Payment');
    expect(within(dialog).getByLabelText('Capital required (%)')).toHaveValue('30');

    user.type(within(dialog).getByLabelText('Target amount'), '350000');
    user.click(within(dialog).getByRole('button', { name: 'Save milestone' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual([
      expect.objectContaining({ title: 'Property Down Payment', targetAmountMinor: 35_000_000, capitalRequiredPercentage: 30, category: 'PROPERTY', enabled: true }),
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows what is wrong and does not save', async () => {
    const { user, save } = setup(unset());
    user.click(screen.getByRole('button', { name: 'Custom' }));
    user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save milestone' }));

    expect(screen.getByText('Give it a name.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount such as 350000.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says so when saving fails', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'No connection.' } });
    const { user } = setup(unset(), failing);
    user.click(screen.getByRole('button', { name: 'Sabbatical' }));
    user.type(screen.getByLabelText('Target amount'), '40000');
    user.click(screen.getByRole('button', { name: 'Save milestone' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/connection/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('CapitalHorizonCard: active milestone', () => {
  it('shows the months away, the capital target and the progress', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Property Down Payment: 13 months away' })).toBeInTheDocument();
    expect(screen.getByText('€105,000 capital target (30% requirement) · Paced with your current lifestyle & spending protected.')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: '€80,000 of €105,000 capital target' });
    expect(bar).toHaveAttribute('aria-valuenow', '76');
  });

  it('still offers a quiet way to add another while there is room', () => {
    setup();
    expect(screen.getByRole('button', { name: '+ Set a milestone target' })).toBeInTheDocument();
  });

  it('stops offering more at the limit', () => {
    const three = ['a', 'b', 'c'].map((id) => makePacedMilestone({ id, title: `Goal ${id}` }));
    setup(makeCapitalHorizon({ milestones: three }));
    expect(screen.queryByRole('button', { name: '+ Set a milestone target' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit milestone' })).toHaveLength(3);
  });
});

describe('CapitalHorizonCard: achieved', () => {
  it('says the goal is achieved with a full bar', () => {
    setup(achieved());
    expect(screen.getByRole('heading', { name: 'Property Down Payment: Goal achieved!' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('CapitalHorizonCard: editing', () => {
  it('opens the editor with the current values and saves the changes in place', async () => {
    const { user, save } = setup();
    user.click(screen.getByRole('button', { name: 'Edit milestone' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Property Down Payment');
    expect(within(dialog).getByLabelText('Target amount')).toHaveValue('350000');
    user.type(within(dialog).getByLabelText('Target amount'), '400000');
    user.type(within(dialog).getByLabelText('Capital required (%)'), '25');
    user.click(within(dialog).getByRole('button', { name: 'Save milestone' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'm1', targetAmountMinor: 40_000_000, capitalRequiredPercentage: 25, enabled: true })]);
  });

  it('keeps the other milestones when one is edited', async () => {
    const two = [makePacedMilestone(), makePacedMilestone({ id: 'm2', title: 'Sabbatical Fund', category: 'SABBATICAL' })];
    const { user, save } = setup(makeCapitalHorizon({ milestones: two }));
    user.click(screen.getAllByRole('button', { name: 'Edit milestone' })[0]);
    user.click(screen.getByRole('button', { name: 'Save milestone' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect((save.mock.calls[0][0] as { id: string }[]).map(({ id }) => id)).toEqual(['m1', 'm2']);
  });

  it('sends only what the contract holds: no pacing figures', async () => {
    const { user, save } = setup();
    user.click(screen.getByRole('button', { name: 'Edit milestone' }));
    user.click(screen.getByRole('button', { name: 'Save milestone' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.keys((save.mock.calls[0][0] as object[])[0]).sort()).toEqual(['capitalRequiredPercentage', 'category', 'enabled', 'id', 'targetAmountMinor', 'title']);
  });

  it('deletes the milestone after a confirmation, sending the list without it', async () => {
    const { user, save } = setup();
    user.click(screen.getByRole('button', { name: 'Edit milestone' }));
    user.click(screen.getByRole('button', { name: 'Delete milestone' }));
    expect(save).not.toHaveBeenCalled();

    user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith([]));
  });

  it('can be cancelled without saving', async () => {
    const { user, save } = setup();
    user.click(screen.getByRole('button', { name: 'Edit milestone' }));
    user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
