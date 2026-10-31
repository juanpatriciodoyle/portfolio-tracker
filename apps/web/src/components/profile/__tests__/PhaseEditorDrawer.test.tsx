import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import PhaseEditorDrawer from '../PhaseEditorDrawer';

const ok = { ok: true as const, value: undefined };

function renderDrawer(overrides: Partial<React.ComponentProps<typeof PhaseEditorDrawer>> = {}) {
  const props: React.ComponentProps<typeof PhaseEditorDrawer> = {
    isOpen: true,
    phase: null,
    phases: [makePhase({ id: 'p1', name: 'Madrid', startDate: '2022-09-01', endDate: null })],
    hasCurrentPhase: true,
    defaultCurrency: 'EUR',
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
  render(<PhaseEditorDrawer {...props} />);
  return props;
}

function fillLisbon() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lisbon flat' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Lisbon' } });
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'PT' } });
  fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2020-01-01' } });
  fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: '2022-08-31' } });
  fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2800' } });
}

const submit = (label = 'Add living phase') => fireEvent.click(screen.getByRole('button', { name: label }));

describe('PhaseEditorDrawer', () => {
  it('renders nothing while closed', () => {
    renderDrawer({ isOpen: false });

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByText('Add a living phase')).not.toBeInTheDocument();
  });

  it('opens empty, with "Still living here" off when a current home already exists', () => {
    renderDrawer();

    expect(screen.getByRole('heading', { name: 'Add a living phase' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Still living here')).not.toBeChecked();
    expect(screen.getByLabelText('Moved out')).toBeEnabled();
  });

  it('ticks "Still living here" for the first home and locks the move-out date', () => {
    renderDrawer({ hasCurrentPhase: false });

    expect(screen.getByLabelText('Still living here')).toBeChecked();
    expect(screen.getByLabelText('Moved out')).toBeDisabled();
  });

  it('starts a new phase in the currency of the last one', () => {
    renderDrawer({ defaultCurrency: 'ARS' });

    expect(screen.getByLabelText('Currency')).toHaveValue('ARS');
  });

  it('asks for everything that is missing and does not submit', () => {
    const props = renderDrawer();

    submit();

    expect(screen.getByText('Give this phase a name, for example "Madrid".')).toBeInTheDocument();
    expect(screen.getByText('Which city was it?')).toBeInTheDocument();
    expect(screen.getByText('Choose a country.')).toBeInTheDocument();
    expect(screen.getByText('Add the day you moved in.')).toBeInTheDocument();
    expect(screen.getByText('Enter your monthly net income, for example 3200 (0 if none).')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a move-out date before the move-in date', () => {
    const props = renderDrawer();
    fillLisbon();
    fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: '2019-12-31' } });

    submit();

    expect(screen.getByText('End date cannot be before the start date')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('wants a move-out date unless the person still lives there', () => {
    const props = renderDrawer();
    fillLisbon();
    fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: '' } });

    submit();

    expect(screen.getByText('Add the day you left, or tick "Still living here".')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the phase as the server expects it', async () => {
    const props = renderDrawer();
    fillLisbon();

    submit();

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(props.onSubmit).mock.calls[0][0].create).toEqual({
      name: 'Lisbon flat',
      city: 'Lisbon',
      address: null,
      countryCode: 'PT',
      tenure: 'RENT',
      startDate: '2020-01-01',
      endDate: '2022-08-31',
      currency: 'EUR',
      monthlyIncomeMinor: 280000,
      notes: null,
      fixedCosts: [],
    });
  });

  it('names the phases a rejected overlap collides with', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, failure: { kind: 'overlap', message: 'Phases overlap', conflictingPhaseIds: ['p1'] } });
    renderDrawer({ onSubmit });
    fillLisbon();

    submit();

    expect(await screen.findByText(/These dates overlap Madrid \(Sep 2022 – now\)/)).toBeInTheDocument();
  });

  it('shows a server-side field problem beside its field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      failure: { kind: 'validation', message: 'Invalid request', issues: [{ path: 'name', message: 'That name is already used' }] },
    });
    renderDrawer({ onSubmit });
    fillLisbon();

    submit();

    const message = await screen.findByText('That name is already used');
    expect(message).toHaveAttribute('id', expect.stringMatching(/-name-error$/));
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a general failure when the problem belongs to no field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    renderDrawer({ onSubmit });
    fillLisbon();

    submit();

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
  });

  it('edits an existing phase with every field filled in', async () => {
    const phase = makePhase({
      id: 'p9',
      name: 'Lisbon flat',
      city: 'Lisbon',
      countryCode: 'PT',
      tenure: 'OWN',
      startDate: '2020-01-01',
      endDate: '2022-08-31',
      monthlyIncomeMinor: 280050,
      address: 'Rua Augusta 1',
      notes: 'Sunny',
    });
    const props = renderDrawer({ phase, hasCurrentPhase: true });

    expect(screen.getByRole('heading', { name: 'Edit living phase' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Lisbon flat');
    expect(screen.getByLabelText('Country')).toHaveValue('PT');
    expect(screen.getByLabelText('Housing')).toHaveValue('OWN');
    expect(screen.getByLabelText('Monthly net income')).toHaveValue('2800.50');
    expect(screen.getByLabelText('Address (optional)')).toHaveValue('Rua Augusta 1');
    expect(screen.getByLabelText('Still living here')).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    submit('Save changes');

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    const { update } = vi.mocked(props.onSubmit).mock.calls[0][0];
    expect(update).toMatchObject({ name: 'Lisbon flat', monthlyIncomeMinor: 290000, endDate: '2022-08-31', address: 'Rua Augusta 1' });
    expect(update).not.toHaveProperty('fixedCosts');
  });

  it('closes on Escape and on Cancel', () => {
    const props = renderDrawer();

    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
