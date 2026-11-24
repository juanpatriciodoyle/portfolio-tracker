import { describe, it, expect } from 'vitest';
import { translatorFor } from '../../i18n/translate';
import { formatHeld } from '../heldDuration';

const en = translatorFor('en');
const es = translatorFor('es-AR');

describe('formatHeld', () => {
  it('counts days up to a month', () => {
    expect(formatHeld(1, en, 'en-US')).toBe('1 day');
    expect(formatHeld(12, en, 'en-US')).toBe('12 days');
    expect(formatHeld(29, en, 'en-US')).toBe('29 days');
  });

  it('never says 0 days: a holding bought today has been held one day', () => {
    expect(formatHeld(0, en, 'en-US')).toBe('1 day');
    expect(formatHeld(-3, en, 'en-US')).toBe('1 day');
  });

  it('counts months from a month up to a year', () => {
    expect(formatHeld(30, en, 'en-US')).toBe('1 month');
    expect(formatHeld(91, en, 'en-US')).toBe('3 months');
    expect(formatHeld(364, en, 'en-US')).toBe('12 months');
  });

  it('counts years with one decimal from a year', () => {
    expect(formatHeld(365, en, 'en-US')).toBe('1 year');
    expect(formatHeld(2477, en, 'en-US')).toBe('6.8 years');
    expect(formatHeld(730, en, 'en-US')).toBe('2 years');
  });

  it('writes the same figures in Argentine Spanish, with its decimal comma', () => {
    expect(formatHeld(12, es, 'es-AR')).toBe('12 días');
    expect(formatHeld(91, es, 'es-AR')).toBe('3 meses');
    expect(formatHeld(2477, es, 'es-AR')).toBe('6,8 años');
    expect(formatHeld(365, es, 'es-AR')).toBe('1 año');
  });
});
