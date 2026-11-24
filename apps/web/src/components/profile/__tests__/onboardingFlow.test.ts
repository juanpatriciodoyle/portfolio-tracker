import { describe, expect, it } from 'vitest';
import type { ProfileData } from '../../../contracts';
import { translateEnglish as t } from '../../../i18n/translate';
import {
  ONBOARDING_STEPS,
  buildOnboarding,
  chooseCountry,
  initialAnswers,
  onboardingAnswersSchema,
  onboardingStepErrors,
  type OnboardingAnswers,
} from '../onboardingFlow';

const TODAY = '2026-11-23';
const emptyProfile: ProfileData = { fullName: null, birthYear: null, nationalities: [], taxResidence: null, householdAdults: 1, dependentChildren: 0, employmentStatus: null };

const madrid: OnboardingAnswers = { countryCode: 'ES', city: 'Madrid', currency: 'EUR', monthlyIncome: '3200', rent: '1200', paysNoRent: false, movedIn: '' };

describe('the first-time flow', () => {
  it('asks three questions: where, what comes in, what the rent is', () => {
    expect(ONBOARDING_STEPS).toEqual(['place', 'income', 'rent']);
  });

  it('starts empty, in the currency of the last home or the euro', () => {
    expect(initialAnswers('EUR')).toEqual({ countryCode: '', city: '', currency: 'EUR', monthlyIncome: '', rent: '', paysNoRent: false, movedIn: '' });
  });

  it('takes the currency of the country chosen, and keeps the current one for a country it does not know', () => {
    expect(chooseCountry(initialAnswers('EUR'), 'AR').currency).toBe('ARS');
    expect(chooseCountry(initialAnswers('EUR'), 'GB').currency).toBe('GBP');
    expect(chooseCountry(initialAnswers('ARS'), 'ZZ').currency).toBe('ARS');
    expect(chooseCountry(initialAnswers('EUR'), 'AR').countryCode).toBe('AR');
  });
});

describe('what each step still needs', () => {
  it('needs a country and a city to leave the first step', () => {
    expect(onboardingStepErrors(initialAnswers('EUR'), 'place', TODAY, t)).toEqual({ countryCode: 'Choose a country.', city: 'Which city?' });
    expect(onboardingStepErrors({ ...madrid, city: '' }, 'place', TODAY, t)).toEqual({ city: 'Which city?' });
    expect(onboardingStepErrors(madrid, 'place', TODAY, t)).toEqual({});
  });

  it('lets the income stay empty: it is optional, and nothing typed is a home with no income', () => {
    expect(onboardingStepErrors({ ...madrid, monthlyIncome: '' }, 'income', TODAY, t)).toEqual({});
    expect(onboardingStepErrors({ ...madrid, monthlyIncome: 'a lot' }, 'income', TODAY, t)).toEqual({ monthlyIncome: 'Enter an amount such as 3200, or leave it empty.' });
  });

  it('lets the rent stay empty or be skipped, but not be nonsense', () => {
    expect(onboardingStepErrors({ ...madrid, rent: '' }, 'rent', TODAY, t)).toEqual({});
    expect(onboardingStepErrors({ ...madrid, rent: '', paysNoRent: true }, 'rent', TODAY, t)).toEqual({});
    expect(onboardingStepErrors({ ...madrid, rent: 'lots' }, 'rent', TODAY, t)).toEqual({ rent: 'Enter an amount such as 1200, or leave it empty.' });
    expect(onboardingStepErrors({ ...madrid, rent: 'lots', paysNoRent: true }, 'rent', TODAY, t)).toEqual({});
  });
});

describe('what is saved when the person finishes', () => {
  it('makes the home they live in today, with its income and its rent', () => {
    const result = buildOnboarding(madrid, TODAY, { profile: emptyProfile, accountName: null }, t);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phase.create).toMatchObject({
      city: 'Madrid',
      countryCode: 'ES',
      currency: 'EUR',
      tenure: 'RENT',
      startDate: TODAY,
      endDate: null,
      incomeStreams: [{ label: 'Salary', amountMinor: 320000, startDate: TODAY, endDate: null }],
      fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 }],
    });
  });

  it('makes a home with no income and no rent when both are left empty', () => {
    const result = buildOnboarding({ ...madrid, monthlyIncome: '', rent: '' }, TODAY, { profile: emptyProfile, accountName: null }, t);

    expect(result.ok && result.phase.create.incomeStreams).toEqual([]);
    expect(result.ok && result.phase.create.fixedCosts).toEqual([]);
  });

  it('says it is not rented, and adds no rent, for someone who pays none', () => {
    const result = buildOnboarding({ ...madrid, rent: '1200', paysNoRent: true }, TODAY, { profile: emptyProfile, accountName: null }, t);

    expect(result.ok && result.phase.create.tenure).toBe('OTHER');
    expect(result.ok && result.phase.create.fixedCosts).toEqual([]);
  });

  it('reads amounts in the currency: yen have no cents', () => {
    const result = buildOnboarding({ ...madrid, countryCode: 'JP', currency: 'JPY', monthlyIncome: '300000', rent: '90000' }, TODAY, { profile: emptyProfile, accountName: null }, t);

    expect(result.ok && result.phase.create.incomeStreams[0].amountMinor).toBe(300000);
    expect(result.ok && result.phase.create.fixedCosts[0].amountMinor).toBe(90000);
  });

  it('reports what is wrong instead of saving half an answer', () => {
    const result = buildOnboarding({ ...madrid, city: '', rent: 'lots' }, TODAY, { profile: emptyProfile, accountName: null }, t);

    expect(result).toEqual({ ok: false, errors: { city: 'Which city?', rent: 'Enter an amount such as 1200, or leave it empty.' } });
  });
});

describe('the profile that goes with it', () => {
  it('takes the name the account already greets the person with, so it is never asked again', () => {
    const result = buildOnboarding(madrid, TODAY, { profile: emptyProfile, accountName: 'Reviewer' }, t);

    expect(result.ok && result.profile).toEqual({ ...emptyProfile, fullName: 'Reviewer' });
  });

  it('leaves a profile alone when it already has a name, or when there is no name to take', () => {
    const named = { ...emptyProfile, fullName: 'Juan' };

    expect(buildOnboarding(madrid, TODAY, { profile: named, accountName: 'Reviewer' }, t)).toMatchObject({ ok: true, profile: null });
    expect(buildOnboarding(madrid, TODAY, { profile: emptyProfile, accountName: null }, t)).toMatchObject({ ok: true, profile: null });
  });

  it('keeps everything else in an existing profile when it adds the name', () => {
    const existing = { ...emptyProfile, birthYear: 1990, nationalities: ['AR'], householdAdults: 2 };

    const result = buildOnboarding(madrid, TODAY, { profile: existing, accountName: 'Reviewer' }, t);

    expect(result.ok && result.profile).toEqual({ ...existing, fullName: 'Reviewer' });
  });
});

describe('when the person moved in', () => {
  const context = { profile: emptyProfile, accountName: null };

  it('is today unless the person says otherwise: the home starts on the day it is added', () => {
    const result = buildOnboarding(madrid, TODAY, context, t);
    expect(result.ok && result.phase.create.startDate).toBe(TODAY);
  });

  it('is the day the person gave, when they moved in earlier', () => {
    const result = buildOnboarding({ ...madrid, movedIn: '2023-03-01' }, TODAY, context, t);
    expect(result.ok && result.phase.create.startDate).toBe('2023-03-01');
  });

  it('cannot be a day that has not come yet, and the first step is the one that says so', () => {
    const answers = { ...madrid, movedIn: '2026-12-01' };
    expect(onboardingStepErrors(answers, 'place', TODAY, t)).toEqual({ movedIn: 'Moved in cannot be a day in the future.' });
    expect(onboardingStepErrors(answers, 'income', TODAY, t)).toEqual({});
  });

  it('reads a draft saved before the question existed as "today"', () => {
    const older = { countryCode: 'ES', city: 'Madrid', currency: 'EUR', monthlyIncome: '', rent: '', paysNoRent: false };
    expect(onboardingAnswersSchema.parse(older).movedIn).toBe('');
  });
});
