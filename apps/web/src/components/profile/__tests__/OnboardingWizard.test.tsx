import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePhase, makeProfile } from '../../../test/fixtures';
import { chooseCountry, clickContinue } from '../../../test/wizardHelpers';
import OnboardingWizard from '../OnboardingWizard';

const ok = { ok: true as const, value: undefined };
const emptyProfile = makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: null });

function renderWizard(overrides: Partial<React.ComponentProps<typeof OnboardingWizard>> = {}) {
  const props: React.ComponentProps<typeof OnboardingWizard> = {
    profile: emptyProfile,
    phases: [],
    hasCurrentPhase: false,
    defaultCurrency: 'EUR',
    today: '2026-10-31',
    onSaveProfile: vi.fn().mockResolvedValue(ok),
    onCreatePhase: vi.fn().mockResolvedValue(ok),
    onFinished: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<OnboardingWizard {...props} />);
  return { props, ...view };
}

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const progress = () => screen.getByRole('progressbar').getAttribute('aria-valuetext');

async function completeAboutYou() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Joe Doyle' } });
  fireEvent.change(screen.getByLabelText('Year of birth (optional)'), { target: { value: '1990' } });
  clickContinue();
  const nationalities = screen.getByLabelText('Nationalities (optional)');
  fireEvent.change(nationalities, { target: { value: 'Argentina, España,' } });
  await chooseCountry('Tax residence (optional)', 'spa', /Spain/);
  clickContinue();
  fireEvent.change(screen.getByLabelText('Work (optional)'), { target: { value: 'EMPLOYEE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Increase adults in household' }));
  fireEvent.click(screen.getByRole('button', { name: /^(Continue|Finish)$/ }));
}

async function completeFirstHome() {
  await chooseCountry('Country', 'spa', /Spain/);
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Madrid' } });
  clickContinue();
  fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2022-09-01' } });
  clickContinue();
  fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '3200' } });
  clickContinue();
}

beforeEach(() => sessionStorage.clear());

describe('OnboardingWizard', () => {
  it('walks through about you and then the first living phase, as one flow', () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: 'Tell us about yourself' })).toBeInTheDocument();
    expect(heading()).toBe('What should we call you?');
    expect(progress()).toBe('Step 1 of 7: You');
  });

  it('skips the home when there already is one', () => {
    renderWizard({ phases: [makePhase()] });

    expect(progress()).toBe('Step 1 of 3: You');
  });

  it('wants a name, so the profile is not empty afterwards', () => {
    renderWizard();

    clickContinue();

    expect(screen.getByText('Tell us what to call you.')).toBeInTheDocument();
    expect(heading()).toBe('What should we call you?');
  });

  it('checks the year of birth as it is typed', () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText('Year of birth (optional)'), { target: { value: '90' } });

    expect(screen.getByText('Use a four-digit year such as 1990.')).toBeInTheDocument();
  });

  it('lets the optional steps be skipped', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Joe' } });
    clickContinue();

    clickContinue();

    expect(heading()).toBe('How do you live day to day?');
  });

  it('turns typed nationalities into pills', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Joe' } });
    clickContinue();

    fireEvent.change(screen.getByLabelText('Nationalities (optional)'), { target: { value: 'Argentina, España,' } });

    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).toHaveTextContent('🇦🇷 Argentina');
    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).toHaveTextContent('🇪🇸 Spain');
  });

  it('saves the profile, then the first home with its bills, and reports that it is done', async () => {
    const { props } = renderWizard();
    await completeAboutYou();
    await completeFirstHome();
    fireEvent.click(screen.getByRole('button', { name: 'Add a bill' }));
    fireEvent.click(screen.getByLabelText('Rent'));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledWith({
      fullName: 'Joe Doyle',
      birthYear: 1990,
      nationalities: ['AR', 'ES'],
      taxResidence: 'ES',
      householdAdults: 2,
      dependentChildren: 0,
      employmentStatus: 'EMPLOYEE',
    });
    expect(props.onCreatePhase).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onCreatePhase).mock.calls[0][0].create).toMatchObject({
      name: '🇪🇸 Madrid',
      startDate: '2022-09-01',
      endDate: null,
      monthlyIncomeMinor: 320000,
      fixedCosts: [expect.objectContaining({ category: 'RENT', amountMinor: 120000 })],
    });
    expect(sessionStorage.getItem('draft:onboarding')).toBeNull();
  });

  it('saves only the profile when a home already exists', async () => {
    const { props } = renderWizard({ phases: [makePhase()] });
    await completeAboutYou();

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);
    expect(props.onCreatePhase).not.toHaveBeenCalled();
  });

  it('stays open and says why when the profile cannot be saved', async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    const { props } = renderWizard({ phases: [makePhase()], onSaveProfile });

    await completeAboutYou();

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(props.onFinished).not.toHaveBeenCalled();
  });

  it('does not save the profile twice when only the home had to be retried', async () => {
    const onCreatePhase = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, failure: { kind: 'overlap', message: 'overlap', conflictingPhaseIds: [] } })
      .mockResolvedValue(ok);
    const { props } = renderWizard({ onCreatePhase });
    await completeAboutYou();
    await completeFirstHome();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText(/These dates overlap/)).toBeInTheDocument();
    expect(heading()).toBe('When were you there?');
    clickContinue();
    clickContinue();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);
    expect(onCreatePhase).toHaveBeenCalledTimes(2);
  });

  it('resumes on the step the person closed it on, with their answers', async () => {
    const first = renderWizard();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Joe Doyle' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Nationalities (optional)'), { target: { value: 'Italy,' } });
    first.unmount();

    renderWizard();

    expect(heading()).toBe('Where are you from?');
    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).toHaveTextContent('Italy');
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Joe Doyle');
  });

  it('closes from Cancel on the first step', () => {
    const { props } = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
