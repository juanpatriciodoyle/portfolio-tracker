import { catalogs, type MessageKey } from '../i18n/catalogs';
import type { Locale } from '../i18n/locale';
import { activeLocale } from '../i18n/activeLocale';
import { translatorFor, type Translate } from '../i18n/translate';

/** The words and the language a message is shown in. */
export interface Words {
  t: Translate;
  locale: Locale;
}

/** Answers the server marks with a machine-readable `code`. */
const BY_CODE: Readonly<Record<string, MessageKey>> = {
  DUPLICATE_BILLING_RECORD: 'error.duplicateBill',
  ENCRYPTION_NOT_CONFIGURED: 'error.encryptionUnavailable',
  NOT_A_PDF: 'error.notPdf',
  DOCUMENT_TOO_LARGE: 'error.pdfTooLarge',
  TOO_MANY_PAGES: 'error.pdfTooManyPages',
  UNREADABLE_DOCUMENT: 'error.pdfUnreadable',
  EXTRACTION_BUSY: 'error.pdfBusy',
  RATE_LIMITED: 'error.pdfRateLimited',
  REGISTRATION_CLOSED: 'error.registrationClosed',
  PASSKEY_NOT_FOR_ADMIN: 'error.passkeyNotForAdmin',
};

/**
 * Messages the server words in English and sends without a code (sign-in refusals, limits). Their text in
 * the English catalog is the server's own, so the message is recognised by it.
 */
const SERVER_TEXT_KEYS: readonly MessageKey[] = [
  'error.registrationClosed',
  'error.googleUnverified',
  'error.googleNotConfigured',
  'error.passkeyNeedsGoogle',
  'error.passkeyNotForAdmin',
  'error.tooManySignIns',
  'error.googleNoToken',
  'error.googleServer',
  'error.passkeyEmail',
  'error.passkeyStart',
  'error.passkeyProof',
  'error.passkeyFailed',
  'error.server',
  'error.invalidRequest',
];

const KEY_BY_SERVER_TEXT = new Map<string, MessageKey>(SERVER_TEXT_KEYS.map((key) => [String(catalogs.en[key]), key]));

const asRecord = (body: unknown): Record<string, unknown> => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {});

/** The sentence the server wrote, if it wrote one. */
export function writtenByServer(body: unknown): string {
  const { error } = asRecord(body);
  return typeof error === 'string' ? error.trim() : '';
}

/** Our own words for an answer we recognise (by its code, or by the sentence the server always uses for it), else null. */
export function knownServerMessage(body: unknown, t: Translate): string | null {
  const { code, availableUnits } = asRecord(body);
  if (code === 'INSUFFICIENT_HOLDINGS') {
    return typeof availableUnits === 'number' && availableUnits > 0 ? t('tx.canSellAtMost', { units: availableUnits }) : t('tx.notHeld');
  }
  if (typeof code === 'string' && code in BY_CODE) return t(BY_CODE[code]);
  const known = KEY_BY_SERVER_TEXT.get(writtenByServer(body));
  return known ? t(known) : null;
}

/**
 * What the server said, in words the person can read. In English the server's own sentence is the most exact one, so it
 * is kept. In another language an answer we recognise is shown in our own words, and one we do not gets the generic
 * message given as `fallback`: a sentence in the wrong language helps nobody.
 */
export function serverMessage(body: unknown, { t, locale }: Words, fallback: MessageKey): string {
  const written = writtenByServer(body);
  if (locale === 'en' && written !== '') return written;
  return knownServerMessage(body, t) ?? t(fallback);
}

/** The words of the language chosen on screen, for code that has no component to ask (the API boundary). */
export function currentWords(): Words {
  const locale = activeLocale() ?? 'en';
  return { t: translatorFor(locale), locale };
}
