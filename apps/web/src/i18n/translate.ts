import { activeLocale } from './activeLocale';
import { catalogs, type MessageKey } from './catalogs';
import { intlLocale, type Locale } from './locale';
import type { Message, Params } from './types';

export type { MessageKey };

/** Turns a key into text in one language. Pure code that words something for the screen takes one. */
export type Translate = (key: MessageKey, params?: Params) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills each {name} with its value; a name with no value stays visible so the gap is noticed. */
export function interpolate(text: string, params: Params = {}): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** The names a message asks for, once each and sorted. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
}

/** The singular or plural text for a count, by the language's own rule. Plain text has one form. */
export function pickForm(message: Message, locale: Locale, count: number): string {
  if (typeof message === 'string') return message;
  return new Intl.PluralRules(intlLocale(locale)).select(count) === 'one' ? message.one : message.other;
}

export function createTranslator(locale: Locale): Translate {
  return (key, params) => interpolate(pickForm(catalogs[locale][key], locale, Number(params?.count ?? 0)), params);
}

const translators = new Map<Locale, Translate>();

/** The translator of a language, made once. */
export function translatorFor(locale: Locale): Translate {
  let translator = translators.get(locale);
  if (!translator) {
    translator = createTranslator(locale);
    translators.set(locale, translator);
  }
  return translator;
}

/**
 * The translator of the language chosen on screen. For pure helpers whose callers are many (form checks, descriptions):
 * they take a translator as their last argument and default to this one, so a screen can still pass its own.
 */
export const currentTranslator = (): Translate => translatorFor(activeLocale() ?? 'en');

/** English, the language of the source text and the default wherever no one has chosen. */
export const translateEnglish: Translate = translatorFor('en');
