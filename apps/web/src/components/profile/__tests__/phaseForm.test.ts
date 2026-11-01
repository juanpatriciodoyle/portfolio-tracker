import { describe, expect, it } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import {
  PHASE_STEP_FIELDS,
  initialPhaseForm,
  phaseFeedback,
  phaseStepErrors,
  validatePhaseForm,
  type PhaseFormState,
  type PhaseStepId,
} from '../phaseForm';

const TODAY = '2026-10-31';

const filled: PhaseFormState = {
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  currency: 'EUR',
  startDate: '2022-09-01',
  endDate: '',
  stillLivingHere: true,
  monthlyIncome: '3200',
  address: '',
  notes: '',
};

const validate = (form: PhaseFormState) => validatePhaseForm(form, TODAY);

describe('initialPhaseForm', () => {
  it('starts empty for a new phase, using the given defaults', () => {
    const form = initialPhaseForm(null, { currency: 'ARS', stillLivingHere: false });

    expect(form).toMatchObject({ city: '', currency: 'ARS', stillLivingHere: false, tenure: 'RENT', monthlyIncome: '' });
    expect(form).not.toHaveProperty('name');
  });

  it('fills every field from an existing phase', () => {
    const form = initialPhaseForm(
      makePhase({ endDate: '2024-03-31', monthlyIncomeMinor: 320050, address: 'Calle Mayor 1', notes: 'Great place' }),
      { currency: 'USD', stillLivingHere: true }
    );

    expect(form).toMatchObject({
      city: 'Madrid',
      currency: 'EUR',
      endDate: '2024-03-31',
      stillLivingHere: false,
      monthlyIncome: '3200.50',
      address: 'Calle Mayor 1',
      notes: 'Great place',
    });
  });

  it('marks a phase without an end date as the one still lived in', () => {
    expect(initialPhaseForm(makePhase({ endDate: null }), { currency: 'EUR', stillLivingHere: false }).stillLivingHere).toBe(true);
  });
});

describe('validatePhaseForm', () => {
  it('accepts a complete form, turning the amount into minor units and "still living here" into no end date', () => {
    const result = validate(filled);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.create).toMatchObject({
      city: 'Madrid',
      countryCode: 'ES',
      startDate: '2022-09-01',
      endDate: null,
      monthlyIncomeMinor: 320000,
      address: null,
      notes: null,
      fixedCosts: [],
    });
    expect(result.payload.update).not.toHaveProperty('fixedCosts');
    expect(result.payload.update).toMatchObject({ endDate: null, monthlyIncomeMinor: 320000 });
  });

  it('names the phase after its flag, city and address, so nobody has to type a name', () => {
    const result = validate({ ...filled, address: ' Calle Mayor 1 ' });

    expect(result.ok && result.payload.create.name).toBe('🇪🇸 Madrid');
    expect(result.ok && result.payload.update.name).toBe('🇪🇸 Madrid');
  });

  it('sends the bills given along with a new phase', () => {
    const bill = { category: 'RENT' as const, cadence: 'MONTHLY' as const, amountMinor: 120000 };
    const result = validatePhaseForm(filled, TODAY, [bill]);

    expect(result.ok && result.payload.create.fixedCosts).toEqual([expect.objectContaining(bill)]);
  });

  it('reads European and English amounts alike', () => {
    for (const text of ['3.200,50', '3,200.50', '3200.5']) {
      const result = validate({ ...filled, monthlyIncome: text });

      expect(result.ok && result.payload.create.monthlyIncomeMinor).toBe(320050);
    }
  });

  it('asks for everything that is missing, in plain words', () => {
    const result = validate({ ...filled, city: '', countryCode: '', startDate: '', monthlyIncome: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      city: 'Which city was it?',
      countryCode: 'Choose a country.',
      startDate: 'Add the day you moved in.',
      monthlyIncome: 'Enter your monthly net income, for example 3200 (0 if none).',
    });
  });

  it('asks for an end date unless the person still lives there', () => {
    const result = validate({ ...filled, stillLivingHere: false, endDate: '' });

    expect(result).toMatchObject({ ok: false, errors: { endDate: 'Add the day you left, or tick "Still living here".' } });
  });

  it('ignores a stale end date while "still living here" is ticked', () => {
    const result = validate({ ...filled, stillLivingHere: true, endDate: '1999-01-01' });

    expect(result.ok && result.payload.create.endDate).toBeNull();
  });

  it('keeps an optional address and notes when given, trimmed', () => {
    const result = validate({ ...filled, address: '  Calle Mayor 1 ', notes: ' Sunny ' });

    expect(result.ok && result.payload.create).toMatchObject({ address: 'Calle Mayor 1', notes: 'Sunny' });
  });

  it('allows a monthly income of zero', () => {
    expect(validate({ ...filled, monthlyIncome: '0' }).ok).toBe(true);
  });
});

describe('date rules', () => {
  const left = { ...filled, stillLivingHere: false };

  it('accepts moving in today, and rejects any later day', () => {
    expect(validate({ ...filled, startDate: TODAY }).ok).toBe(true);
    expect(validate({ ...filled, startDate: '2026-11-01' })).toMatchObject({
      ok: false,
      errors: { startDate: 'Moved in cannot be a day in the future.' },
    });
  });

  it('accepts moving out today, and rejects any later day', () => {
    expect(validate({ ...left, endDate: TODAY }).ok).toBe(true);
    expect(validate({ ...left, endDate: '2026-11-01' })).toMatchObject({
      ok: false,
      errors: { endDate: 'Moved out cannot be a day in the future.' },
    });
  });

  it('wants moving out to come strictly after moving in', () => {
    const message = 'Moved out must be after the day you moved in.';

    expect(validate({ ...left, endDate: '2022-08-31' })).toMatchObject({ ok: false, errors: { endDate: message } });
    expect(validate({ ...left, endDate: '2022-09-01' })).toMatchObject({ ok: false, errors: { endDate: message } });
    expect(validate({ ...left, endDate: '2022-09-02' }).ok).toBe(true);
  });

  it('does not check a move-out date that is hidden by "still living here"', () => {
    expect(validate({ ...filled, endDate: '2030-01-01' }).ok).toBe(true);
  });

  it('reports a future move-in without also complaining about the order of dates', () => {
    const result = validate({ ...left, startDate: '2027-01-01', endDate: '2026-12-01' });

    expect(result).toMatchObject({
      ok: false,
      errors: { startDate: 'Moved in cannot be a day in the future.', endDate: 'Moved out cannot be a day in the future.' },
    });
  });
});

describe('PHASE_STEP_FIELDS', () => {
  it('assigns every field of the form to exactly one step', () => {
    const fields = Object.values(PHASE_STEP_FIELDS).flat();

    expect(new Set(fields).size).toBe(fields.length);
    expect([...fields].sort()).toEqual(Object.keys(filled).filter((field) => field !== 'stillLivingHere').concat('stillLivingHere').sort());
  });
});

describe('phaseStepErrors', () => {
  const empty = initialPhaseForm(null, { currency: 'EUR', stillLivingHere: true });

  it('reports only what the given step asks for', () => {
    expect(Object.keys(phaseStepErrors(empty, TODAY, 'place')).sort()).toEqual(['city', 'countryCode']);
    expect(Object.keys(phaseStepErrors(empty, TODAY, 'dates'))).toEqual(['startDate']);
    expect(Object.keys(phaseStepErrors(empty, TODAY, 'money'))).toEqual(['monthlyIncome']);
  });

  it('reports nothing for a step that is complete, even when a later one is not', () => {
    const form = { ...empty, city: 'Madrid', countryCode: 'ES' };

    expect(phaseStepErrors(form, TODAY, 'place')).toEqual({});
  });
});

describe('phaseFeedback', () => {
  const form: PhaseFormState = { ...filled, city: '', startDate: '2027-01-01' };
  const none = new Set<PhaseStepId>();

  it('keeps quiet about empty fields until their step has been tried', () => {
    expect(phaseFeedback(form, TODAY, none).errorOf('city')).toBeUndefined();
    expect(phaseFeedback(form, TODAY, new Set<PhaseStepId>(['place'])).errorOf('city')).toBe('Which city was it?');
  });

  it('speaks up at once about something typed that cannot be right', () => {
    expect(phaseFeedback(form, TODAY, none).errorOf('startDate')).toBe('Moved in cannot be a day in the future.');
  });

  it('confirms a field once it has an answer that passes', () => {
    const feedback = phaseFeedback({ ...filled, address: 'Calle Mayor 1' }, TODAY, none);

    expect(feedback.isValid('city')).toBe(true);
    expect(feedback.isValid('address')).toBe(true);
    expect(feedback.isValid('startDate')).toBe(true);
  });

  it('does not confirm an empty or wrong field', () => {
    const feedback = phaseFeedback(form, TODAY, none);

    expect(feedback.isValid('city')).toBe(false);
    expect(feedback.isValid('startDate')).toBe(false);
    expect(feedback.isValid('notes')).toBe(false);
  });
});
