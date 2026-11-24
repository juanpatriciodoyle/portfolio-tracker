import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfile } from '../../../test/fixtures';
import { tapTwice } from '../../../test/doubleTap';
import { chooseCountry, clickContinue } from '../../../test/wizardHelpers';
import type { BenchmarkPreviewResponse } from '../../../contracts';
import OnboardingWizard from '../OnboardingWizard';

const preview: BenchmarkPreviewResponse = {
  countryCode: 'ES',
  typicalMonthlyIncome: { amountMinor: 169725, currency: 'EUR', basis: 'EQUIVALISED', period: '2025', source: 'EUROSTAT' },
  incomePercentile: { percentile: 88.7, bound: 'EXACT', period: '2025', source: 'EUROSTAT', basis: 'EQUIVALISED' },
  rent: { housingMonthlyMinor: 120000, yourSharePercent: 37.5, typicalSharePercent: 26.7, differencePoints: 10.8, verdict: 'HIGHER', period: '2025', source: 'EUROSTAT' },
  gaps: [],
};
const asked = vi.fn();
vi.mock('../../../hooks/useBenchmarkPreview', () => ({
  useBenchmarkPreview: (query: unknown) => {
    asked(query);
    return query ? preview : null;
  },
}));

const ok = { ok: true as const, value: undefined };
const emptyProfile = makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: null });

function renderWizard(overrides: Partial<React.ComponentProps<typeof OnboardingWizard>> = {}) {
  const props: React.ComponentProps<typeof OnboardingWizard> = {
    profile: emptyProfile,
    accountName: 'Reviewer',
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
const finish = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish' });

async function answerWhere() {
  await chooseCountry('Country', 'spa', /Spain/);
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Madrid' } });
  clickContinue();
}

beforeEach(() => {
  sessionStorage.clear();
  asked.mockClear();
});

describe('OnboardingWizard: moved in earlier', () => {
  it('starts the home today and asks nothing about it, only offers the way to say otherwise', () => {
    renderWizard();

    expect(screen.getByRole('button', { name: 'Moved in earlier?' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Moved in')).not.toBeInTheDocument();
  });

  it('opens the day on request, never later than today', () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Moved in earlier?' }));

    const day = screen.getByLabelText('Moved in');
    expect(day).toHaveAttribute('type', 'date');
    expect(day).toHaveAttribute('max', '2026-10-31');
    expect(day).toHaveValue('2026-10-31');
  });

  it('saves the home from the day the person gave', async () => {
    const { props } = renderWizard();
    await chooseCountry('Country', 'spa', /Spain/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Madrid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Moved in earlier?' }));
    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2023-03-01' } });
    clickContinue();
    clickContinue();
    fireEvent.click(finish());

    await waitFor(() => expect(props.onCreatePhase).toHaveBeenCalledTimes(1));
    expect(vi.mocked(props.onCreatePhase).mock.calls[0][0].create.startDate).toBe('2023-03-01');
  });

  it('says so when the day has not come yet', async () => {
    renderWizard();
    await chooseCountry('Country', 'spa', /Spain/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Madrid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Moved in earlier?' }));

    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2026-12-01' } });

    expect(screen.getByText('Moved in cannot be a day in the future.')).toBeInTheDocument();
  });
});

describe('OnboardingWizard', () => {
  it('asks three questions, starting with where the person lives', () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: 'Tell us about yourself' })).toBeInTheDocument();
    expect(heading()).toBe('Where do you live?');
    expect(progress()).toBe('Step 1 of 3: Where');
  });

  it('needs a country and a city before going on', () => {
    renderWizard();

    clickContinue();

    expect(screen.getByText('Choose a country.')).toBeInTheDocument();
    expect(screen.getByText('Which city?')).toBeInTheDocument();
    expect(heading()).toBe('Where do you live?');
  });

  it('asks about income in the currency of the country that was chosen', async () => {
    renderWizard();
    await chooseCountry('Country', 'arg', /Argentina/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Buenos Aires' } });
    clickContinue();

    expect(heading()).toBe('What do you earn each month, after tax?');
    expect(screen.getByLabelText('Currency')).toHaveValue('ARS');
    expect(progress()).toBe('Step 2 of 3: Income');
  });

  it('says what it already knows about the country as soon as it is chosen', async () => {
    renderWizard();

    await chooseCountry('Country', 'spa', /Spain/);

    expect(screen.getByText('In Spain, the typical person has about €1,697 a month after tax.')).toBeInTheDocument();
    expect(screen.getByText('Eurostat · 2025')).toBeInTheDocument();
  });

  it('says where the income sits as it is typed, and nothing before an income is typed', async () => {
    renderWizard();
    await answerWhere();
    expect(screen.queryByText(/live on less than that/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Monthly income after tax (optional)'), { target: { value: '3200' } });

    expect(screen.getByText('About 89% of people in Spain live on less than that.')).toBeInTheDocument();
    expect(asked).toHaveBeenLastCalledWith({ countryCode: 'ES', currency: 'EUR', monthlyIncomeMinor: 320000 });
  });

  it('lets the income be skipped', async () => {
    renderWizard();
    await answerWhere();

    clickContinue();

    expect(heading()).toBe('What is your rent?');
    expect(progress()).toBe('Step 3 of 3: Rent');
  });

  it('says what the rent is against the income and what people who rent spend', async () => {
    renderWizard();
    await answerWhere();
    fireEvent.change(screen.getByLabelText('Monthly income after tax (optional)'), { target: { value: '3200' } });
    clickContinue();

    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '1200' } });

    expect(screen.getByText('That is 37.5% of your income. People who pay rent in Spain typically spend 26.7%.')).toBeInTheDocument();
    expect(asked).toHaveBeenLastCalledWith({ countryCode: 'ES', currency: 'EUR', monthlyIncomeMinor: 320000, monthlyRentMinor: 120000 });
  });

  it('checks the rent as it is typed, and puts the rent question aside for someone who pays none', async () => {
    renderWizard();
    await answerWhere();
    clickContinue();

    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '.' } });
    expect(screen.getByText('Enter an amount such as 1200, or leave it empty.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/I don.t pay rent/));
    expect(screen.getByLabelText('Monthly rent')).toBeDisabled();
    expect(screen.queryByText('Enter an amount such as 1200, or leave it empty.')).not.toBeInTheDocument();
  });

  it('saves the home the person lives in, with income and rent, and the name the account already has', async () => {
    const { props } = renderWizard();
    await answerWhere();
    fireEvent.change(screen.getByLabelText('Monthly income after tax (optional)'), { target: { value: '3200' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '1200' } });

    fireEvent.click(finish());

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledWith({ ...emptyProfile, fullName: 'Reviewer' });
    expect(vi.mocked(props.onCreatePhase).mock.calls[0][0].create).toMatchObject({
      name: '🇪🇸 Madrid',
      startDate: '2026-10-31',
      endDate: null,
      tenure: 'RENT',
      incomeStreams: [{ label: 'Salary', amountMinor: 320000, startDate: '2026-10-31', endDate: null }],
      fixedCosts: [expect.objectContaining({ category: 'RENT', amountMinor: 120000 })],
    });
    expect(sessionStorage.getItem('draft:onboarding')).toBeNull();
  });

  it('can be finished with nothing but a place', async () => {
    const { props } = renderWizard();
    await answerWhere();
    clickContinue();

    fireEvent.click(finish());

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(vi.mocked(props.onCreatePhase).mock.calls[0][0].create).toMatchObject({ incomeStreams: [], fixedCosts: [] });
  });

  it('does not touch the profile when it already has a name, or when the account has none to give', async () => {
    const named = renderWizard({ profile: makeProfile({ fullName: 'Juan' }) });
    await answerWhere();
    clickContinue();
    fireEvent.click(finish());
    await waitFor(() => expect(named.props.onFinished).toHaveBeenCalledTimes(1));
    expect(named.props.onSaveProfile).not.toHaveBeenCalled();
  });

  it('saves the home and finishes once, even when Finish is tapped twice', async () => {
    const { props } = renderWizard();
    await answerWhere();
    clickContinue();

    tapTwice(finish());

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);
    expect(props.onCreatePhase).toHaveBeenCalledTimes(1);
  });

  it('stays open and says why when the home cannot be saved, and does not save the profile twice on a retry', async () => {
    const onCreatePhase = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } })
      .mockResolvedValue(ok);
    const { props } = renderWizard({ onCreatePhase });
    await answerWhere();
    clickContinue();

    fireEvent.click(finish());
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(props.onFinished).not.toHaveBeenCalled();
    fireEvent.click(finish());

    await waitFor(() => expect(props.onFinished).toHaveBeenCalledTimes(1));
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);
    expect(onCreatePhase).toHaveBeenCalledTimes(2);
  });

  it('stays open and says why when the profile cannot be saved', async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    const { props } = renderWizard({ onSaveProfile });
    await answerWhere();
    clickContinue();

    fireEvent.click(finish());

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(props.onCreatePhase).not.toHaveBeenCalled();
  });

  it('resumes on the step the person closed it on, with their answers', async () => {
    const first = renderWizard();
    await answerWhere();
    fireEvent.change(screen.getByLabelText('Monthly income after tax (optional)'), { target: { value: '3200' } });
    first.unmount();

    renderWizard();

    expect(heading()).toBe('What do you earn each month, after tax?');
    expect(screen.getByLabelText('Monthly income after tax (optional)')).toHaveValue('3200');
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('City')).toHaveValue('Madrid');
  });

  it('closes from Cancel on the first step', () => {
    const { props } = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
