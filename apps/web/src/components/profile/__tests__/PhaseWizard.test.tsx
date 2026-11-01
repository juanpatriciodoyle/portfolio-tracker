import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDraft } from '../../../lib/stepDraft';
import { ApiError } from '../../../lib/apiClient';
import { makePhase } from '../../../test/fixtures';
import { chooseCountry, clickContinue } from '../../../test/wizardHelpers';
import { phaseDraftSchema } from '../phaseForm';
import PhaseWizard from '../PhaseWizard';

const ok = { ok: true as const, value: undefined };
const TODAY = '2026-10-31';

function renderWizard(overrides: Partial<React.ComponentProps<typeof PhaseWizard>> = {}) {
  const props: React.ComponentProps<typeof PhaseWizard> = {
    phase: null,
    phases: [makePhase({ id: 'p1', name: '🇪🇸 Madrid', startDate: '2022-09-01', endDate: null })],
    hasCurrentPhase: true,
    defaultCurrency: 'EUR',
    today: TODAY,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
  const view = render(<PhaseWizard {...props} />);
  return { props, ...view };
}

async function fillPlace(city = 'Lisbon', country: [string, RegExp] = ['port', /Portugal/]) {
  await chooseCountry('Country', country[0], country[1]);
  fireEvent.change(screen.getByLabelText('City'), { target: { value: city } });
}

const fillDates = (start = '2020-01-01', end = '2022-08-31') => {
  fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: end } });
};

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;

beforeEach(() => sessionStorage.clear());

describe('PhaseWizard', () => {
  it('opens as a centered dialog on its first question, with progress', () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: 'Add a living phase' })).toBeInTheDocument();
    expect(heading()).toBe('Where did you live?');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 1 of 4: Where');
  });

  it('never asks for a name', () => {
    renderWizard();

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('puts the cursor in the first field of every step', async () => {
    renderWizard();
    expect(screen.getByLabelText('Country')).toHaveFocus();

    await fillPlace();
    clickContinue();

    expect(screen.getByLabelText('Moved in')).toHaveFocus();
  });

  it('asks for what is missing before moving on', () => {
    renderWizard();

    clickContinue();

    expect(screen.getByText('Choose a country.')).toBeInTheDocument();
    expect(screen.getByText('Which city was it?')).toBeInTheDocument();
    expect(heading()).toBe('Where did you live?');
  });

  it('shows the header it will generate while the place is typed', async () => {
    renderWizard();

    await fillPlace('Madrid', ['spa', /Spain/]);
    fireEvent.change(screen.getByLabelText('Address (optional)'), { target: { value: 'Calle Mayor 1' } });

    expect(screen.getByText('🇪🇸 Madrid')).toBeInTheDocument();
  });

  it('confirms each answer with a checkmark once it passes', async () => {
    const { baseElement } = renderWizard();
    expect(baseElement.querySelectorAll('.wizard-field__check')).toHaveLength(0);

    await fillPlace();

    expect(baseElement.querySelectorAll('.wizard-field__check')).toHaveLength(2);
  });

  it('moves the milestone bar forward as steps are completed', async () => {
    renderWizard();
    await fillPlace();

    clickContinue();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 4: When');
  });

  it('goes back without losing answers', async () => {
    renderWizard();
    await fillPlace();
    clickContinue();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('City')).toHaveValue('Lisbon');
  });

  it('rejects a move-in date in the future at once, and offers no later day in the picker', async () => {
    renderWizard();
    await fillPlace();
    clickContinue();

    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2026-11-01' } });

    expect(screen.getByText('Moved in cannot be a day in the future.')).toBeInTheDocument();
    expect(screen.getByLabelText('Moved in')).toHaveAttribute('max', TODAY);
    expect(screen.getByLabelText('Moved out')).toHaveAttribute('max', TODAY);
  });

  it('wants the move-out date strictly after the move-in date', async () => {
    renderWizard();
    await fillPlace();
    clickContinue();

    fillDates('2020-01-01', '2020-01-01');
    expect(screen.getByText('Moved out must be after the day you moved in.')).toBeInTheDocument();
    clickContinue();
    expect(heading()).toBe('When were you there?');

    fillDates('2020-01-01', '2020-01-02');
    clickContinue();
    expect(heading()).toBe('What came in each month?');
  });

  it('ticks "Still living here" for the first home and locks the move-out date', async () => {
    renderWizard({ hasCurrentPhase: false });
    await fillPlace();
    clickContinue();

    expect(screen.getByLabelText('Still living here')).toBeChecked();
    expect(screen.getByLabelText('Moved out')).toBeDisabled();
  });

  it('starts a new phase in the currency of the last one', async () => {
    renderWizard({ defaultCurrency: 'ARS' });
    await fillPlace();
    clickContinue();
    fillDates();
    clickContinue();

    expect(screen.getByLabelText('Currency')).toHaveValue('ARS');
  });

  it('adds a phase with its generated name and the bills added along the way', async () => {
    const { props } = renderWizard();
    await fillPlace('Lisbon');
    clickContinue();
    fillDates();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2800' } });
    clickContinue();

    expect(heading()).toBe('What do you pay every month?');
    fireEvent.click(screen.getByRole('button', { name: 'Add a bill' }));
    fireEvent.click(screen.getByLabelText('Rent'));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '950' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));
    expect(screen.getByRole('list', { name: 'Bills added' })).toHaveTextContent('Rent');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add living phase' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(props.onSubmit).mock.calls[0][0];
    expect(payload.create).toMatchObject({
      name: '🇵🇹 Lisbon',
      city: 'Lisbon',
      countryCode: 'PT',
      startDate: '2020-01-01',
      endDate: '2022-08-31',
      monthlyIncomeMinor: 280000,
      fixedCosts: [expect.objectContaining({ category: 'RENT', cadence: 'MONTHLY', amountMinor: 95000 })],
    });
  });

  it('can add a phase with no bills at all', async () => {
    const { props } = renderWizard();
    await fillPlace();
    clickContinue();
    fillDates();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2800' } });
    clickContinue();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add living phase' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(vi.mocked(props.onSubmit).mock.calls[0][0].create.fixedCosts).toEqual([]);
  });

  it('goes to the dates and names the clash when the server finds an overlap', async () => {
    const failure = new ApiError(409, 'Phases overlap', { error: 'Phases overlap', conflictingPhaseIds: ['p1'] });
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'overlap', message: failure.message, conflictingPhaseIds: ['p1'] } });
    renderWizard({ onSubmit });
    await fillPlace();
    clickContinue();
    fillDates();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2800' } });
    clickContinue();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add living phase' }));

    expect(await screen.findByText(/These dates overlap 🇪🇸 Madrid/)).toBeInTheDocument();
    expect(heading()).toBe('When were you there?');
  });

  it('edits in three steps, without bills, and saves the changes', async () => {
    const phase = makePhase({ id: 'p2', city: 'Lisbon', countryCode: 'PT', startDate: '2020-01-01', endDate: '2022-08-31' });
    const { props } = renderWizard({ phase });

    expect(screen.getByRole('dialog', { name: 'Edit living phase' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 1 of 3: Where');
    clickContinue();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    expect(vi.mocked(props.onSubmit).mock.calls[0][0].update).toMatchObject({ name: '🇵🇹 Lisbon', monthlyIncomeMinor: 290000 });
    expect(vi.mocked(props.onSubmit).mock.calls[0][0].update).not.toHaveProperty('fixedCosts');
  });

  it('closes on Escape and from the Cancel button, and keeps the answers', async () => {
    const { props } = renderWizard();
    await fillPlace();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(loadDraft(sessionStorage, 'phase:new', phaseDraftSchema)?.values.form.city).toBe('Lisbon');
  });

  it('continues with Enter in a text field', async () => {
    renderWizard();
    await fillPlace();

    fireEvent.keyDown(screen.getByLabelText('City'), { key: 'Enter' });

    expect(heading()).toBe('When were you there?');
  });
});

describe('PhaseWizard drafts', () => {
  it('saves the answers and the step after every change', async () => {
    renderWizard();
    await fillPlace();
    clickContinue();

    expect(loadDraft(sessionStorage, 'phase:new', phaseDraftSchema)).toMatchObject({ step: 1, values: { form: { city: 'Lisbon', countryCode: 'PT' } } });
  });

  it('does not save a draft for a dialog that was opened and left alone', () => {
    const { unmount } = renderWizard();
    unmount();

    expect(loadDraft(sessionStorage, 'phase:new', phaseDraftSchema)).toBeNull();
  });

  it('resumes exactly where the person left off after the dialog is closed and opened again', async () => {
    const first = renderWizard();
    await fillPlace();
    clickContinue();
    fillDates('2020-01-01', '2021-01-01');
    first.unmount();

    renderWizard();

    expect(heading()).toBe('When were you there?');
    expect(screen.getByLabelText('Moved in')).toHaveValue('2020-01-01');
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('City')).toHaveValue('Lisbon');
  });

  it('forgets the draft once the phase is saved', async () => {
    const { props } = renderWizard();
    await fillPlace();
    clickContinue();
    fillDates();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2800' } });
    clickContinue();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add living phase' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
    await act(async () => {});
    expect(loadDraft(sessionStorage, 'phase:new', phaseDraftSchema)).toBeNull();
  });

  it('keeps a draft for editing apart from the one for a new phase', async () => {
    const phase = makePhase({ id: 'p2', city: 'Lisbon', countryCode: 'PT' });
    renderWizard({ phase });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Porto' } });

    expect(loadDraft(sessionStorage, 'phase:p2', phaseDraftSchema)?.values.form.city).toBe('Porto');
    expect(loadDraft(sessionStorage, 'phase:new', phaseDraftSchema)).toBeNull();
  });
});
