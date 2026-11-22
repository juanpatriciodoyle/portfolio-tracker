import { describe, it, expect } from 'vitest';
import { catalogs } from '../catalogs';
import { placeholdersOf } from '../translate';
import { LOCALES } from '../locale';

const english = catalogs.en;
const textsOf = (message: string | { one: string; other: string }) => (typeof message === 'string' ? [message] : [message.one, message.other]);

describe('message catalogs', () => {
  it.each(LOCALES.filter((locale) => locale !== 'en'))('%s has exactly the keys of English', (locale) => {
    expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(LOCALES.filter((locale) => locale !== 'en'))('%s uses a plural form wherever English does, and only there', (locale) => {
    for (const [key, message] of Object.entries(english)) {
      expect(typeof catalogs[locale][key as keyof typeof english], key).toBe(typeof message);
    }
  });

  it.each(LOCALES.filter((locale) => locale !== 'en'))('%s keeps the {placeholders} of English', (locale) => {
    for (const [key, message] of Object.entries(english)) {
      const translated = catalogs[locale][key as keyof typeof english];
      const expected = textsOf(message).flatMap(placeholdersOf);
      const actual = textsOf(translated).flatMap(placeholdersOf);
      // A plural form may leave {count} out ("a year"), never add or rename one.
      for (const name of new Set(actual)) expect(expected, `${key} has {${name}} that English lacks`).toContain(name);
      for (const name of new Set(expected.filter((n) => n !== 'count'))) expect(actual, `${key} lacks {${name}}`).toContain(name);
    }
  });

  it('has no empty message', () => {
    for (const locale of LOCALES) {
      for (const [key, message] of Object.entries(catalogs[locale])) {
        for (const text of textsOf(message as string | { one: string; other: string })) expect(text.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('uses the voseo of Argentina, never the "tú" forms', () => {
    const tuForms = /\b(tú|tienes|puedes|quieres|elige|ingresa|selecciona|escribe|introduce|haz clic)\b/i;
    for (const [key, message] of Object.entries(catalogs['es-AR'])) {
      for (const text of textsOf(message as string | { one: string; other: string })) expect(text, key).not.toMatch(tuForms);
    }
  });
});
