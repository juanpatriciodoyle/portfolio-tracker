import { describe, expect, it } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import { initialPhaseForm, validatePhaseForm, type PhaseFormState } from '../phaseForm';

const filled: PhaseFormState = {
  name: 'Madrid',
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

describe('initialPhaseForm', () => {
  it('starts empty for a new phase, using the given defaults', () => {
    const form = initialPhaseForm(null, { currency: 'ARS', stillLivingHere: false });

    expect(form).toMatchObject({ name: '', currency: 'ARS', stillLivingHere: false, tenure: 'RENT', monthlyIncome: '' });
  });

  it('fills every field from an existing phase', () => {
    const form = initialPhaseForm(
      makePhase({ endDate: '2024-03-31', monthlyIncomeMinor: 320050, address: 'Calle Mayor 1', notes: 'Great place' }),
      { currency: 'USD', stillLivingHere: true }
    );

    expect(form).toMatchObject({
      name: 'Madrid',
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
    const result = validatePhaseForm(filled);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.create).toMatchObject({
      name: 'Madrid',
      countryCode: 'ES',
      startDate: '2022-09-01',
      endDate: null,
      monthlyIncomeMinor: 320000,
      address: null,
      notes: null,
      fixedCosts: [],
    });
    expect(result.payload.update).not.toHaveProperty('fixedCosts');
    expect(result.payload.update).toMatchObject({ name: 'Madrid', endDate: null, monthlyIncomeMinor: 320000 });
  });

  it('reads European and English amounts alike', () => {
    for (const text of ['3.200,50', '3,200.50', '3200.5']) {
      const result = validatePhaseForm({ ...filled, monthlyIncome: text });

      expect(result.ok && result.payload.create.monthlyIncomeMinor).toBe(320050);
    }
  });

  it('asks for everything that is missing, in plain words', () => {
    const result = validatePhaseForm({
      ...filled,
      name: '  ',
      city: '',
      countryCode: '',
      startDate: '',
      monthlyIncome: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      name: 'Give this phase a name, for example "Madrid".',
      city: 'Which city was it?',
      countryCode: 'Choose a country.',
      startDate: 'Add the day you moved in.',
      monthlyIncome: 'Enter your monthly net income, for example 3200 (0 if none).',
    });
  });

  it('rejects an end date before the start date, and allows the same day', () => {
    const before = validatePhaseForm({ ...filled, stillLivingHere: false, endDate: '2022-08-31' });
    expect(before).toMatchObject({ ok: false, errors: { endDate: 'End date cannot be before the start date' } });

    expect(validatePhaseForm({ ...filled, stillLivingHere: false, endDate: '2022-09-01' }).ok).toBe(true);
  });

  it('asks for an end date unless the person still lives there', () => {
    const result = validatePhaseForm({ ...filled, stillLivingHere: false, endDate: '' });

    expect(result).toMatchObject({ ok: false, errors: { endDate: 'Add the day you left, or tick "Still living here".' } });
  });

  it('ignores a stale end date while "still living here" is ticked', () => {
    const result = validatePhaseForm({ ...filled, stillLivingHere: true, endDate: '1999-01-01' });

    expect(result.ok && result.payload.create.endDate).toBeNull();
  });

  it('keeps an optional address and notes when given, trimmed', () => {
    const result = validatePhaseForm({ ...filled, address: '  Calle Mayor 1 ', notes: ' Sunny ' });

    expect(result.ok && result.payload.create).toMatchObject({ address: 'Calle Mayor 1', notes: 'Sunny' });
  });

  it('allows a monthly income of zero', () => {
    expect(validatePhaseForm({ ...filled, monthlyIncome: '0' }).ok).toBe(true);
  });
});
