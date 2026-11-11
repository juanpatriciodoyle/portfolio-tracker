import { describe, expect, it } from 'vitest';
import { validateTargetForm } from '../secondSalaryTargetForm';

describe('validateTargetForm', () => {
  it('turns what was typed into minor units of the portfolio currency', () => {
    expect(validateTargetForm('2500', 'EUR')).toEqual({ ok: true, monthlyMinor: 250_000 });
    expect(validateTargetForm(' 2500.50 ', 'EUR')).toEqual({ ok: true, monthlyMinor: 250_050 });
  });

  it.each(['', '   ', '0', 'abc', '-5'])('asks for a real amount instead of "%s"', (typed) => {
    expect(validateTargetForm(typed, 'EUR')).toEqual({ ok: false, error: 'Enter an amount such as 2500.' });
  });

  it('refuses an amount too large to store', () => {
    expect(validateTargetForm('99999999999', 'EUR')).toEqual({ ok: false, error: 'That amount is too large.' });
  });
});
