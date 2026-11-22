import { describe, it, expect } from 'vitest';
import { interpolate, pickForm, createTranslator, placeholdersOf } from '../translate';
import { detectLocale, intlLocale, isLocale, LOCALES } from '../locale';

describe('interpolate', () => {
  it('fills each {name} with its value', () => {
    expect(interpolate('Hello {name}, you have {count} messages', { name: 'Ana', count: 3 })).toBe('Hello Ana, you have 3 messages');
  });

  it('fills a name used twice', () => {
    expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x');
  });

  it('leaves a placeholder whose value was not given, so the gap is visible', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
  });

  it('returns text without placeholders as it is', () => {
    expect(interpolate('Plain', { name: 'x' })).toBe('Plain');
  });
});

describe('placeholdersOf', () => {
  it('lists the distinct names, sorted', () => {
    expect(placeholdersOf('{b} {a} {b}')).toEqual(['a', 'b']);
  });
});

describe('pickForm', () => {
  const message = { one: '{count} year', other: '{count} years' };

  it('uses the singular for one in English', () => {
    expect(pickForm(message, 'en', 1)).toBe('{count} year');
    expect(pickForm(message, 'en', 0)).toBe('{count} years');
    expect(pickForm(message, 'en', 2)).toBe('{count} years');
  });

  it('uses the singular for one in Argentine Spanish', () => {
    expect(pickForm({ one: '{count} año', other: '{count} años' }, 'es-AR', 1)).toBe('{count} año');
    expect(pickForm({ one: '{count} año', other: '{count} años' }, 'es-AR', 5)).toBe('{count} años');
  });

  it('returns a plain string unchanged', () => {
    expect(pickForm('Plain', 'en', 7)).toBe('Plain');
  });
});

describe('createTranslator', () => {
  it('translates a key into the chosen language', () => {
    expect(createTranslator('en')('language.label')).toBe('Language');
    expect(createTranslator('es-AR')('language.label')).toBe('Idioma');
  });

  it('chooses the plural form from a count and fills it in', () => {
    expect(createTranslator('en')('duration.years', { count: 1 })).toBe('1 year');
    expect(createTranslator('en')('duration.years', { count: 3 })).toBe('3 years');
    expect(createTranslator('es-AR')('duration.years', { count: 1 })).toBe('1 año');
    expect(createTranslator('es-AR')('duration.years', { count: 3 })).toBe('3 años');
  });
});

describe('locale', () => {
  it('knows its two languages', () => {
    expect(LOCALES).toEqual(['en', 'es-AR']);
    expect(isLocale('es-AR')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('formats as English (US) or Spanish (Argentina)', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('es-AR')).toBe('es-AR');
  });

  describe('detectLocale', () => {
    it('keeps a saved choice over the browser language', () => {
      expect(detectLocale('en', 'es-AR')).toBe('en');
      expect(detectLocale('es-AR', 'en-US')).toBe('es-AR');
    });

    it('uses Argentine Spanish for any Spanish browser when nothing is saved', () => {
      expect(detectLocale(null, 'es-ES')).toBe('es-AR');
      expect(detectLocale(null, 'es')).toBe('es-AR');
      expect(detectLocale(null, 'ES-mx')).toBe('es-AR');
    });

    it('is English otherwise, and for a saved value it does not know', () => {
      expect(detectLocale(null, 'fr-FR')).toBe('en');
      expect(detectLocale(null, undefined)).toBe('en');
      expect(detectLocale('klingon', 'en-US')).toBe('en');
      expect(detectLocale('klingon', 'es-ES')).toBe('es-AR');
    });
  });
});
