import { transactionRequiredByLaterErrorResponse, type SignInErrorCode } from '../contracts';
import { catalogs, type MessageKey } from '../i18n/catalogs';
import type { Locale } from '../i18n/locale';
import { activeLocale } from '../i18n/activeLocale';
import { intlLocale } from '../i18n/locale';
import { formatCalendarDate, formatMinor } from './money';
import { translatorFor, type Translate } from '../i18n/translate';

/** The words and the language a message is shown in. */
export interface Words {
  t: Translate;
  locale: Locale;
}

/** Why a sign-in, a passkey or the demo was refused: every code the server can send has its words, or this file does not compile. */
const SIGN_IN_MESSAGES = {
  GOOGLE_TOKEN_NEEDED: 'error.googleNoToken',
  GOOGLE_TOKEN_UNVERIFIED: 'error.googleUnverified',
  GOOGLE_NOT_CONFIGURED: 'error.googleNotConfigured',
  GOOGLE_SIGN_IN_FAILED: 'error.googleServer',
  REGISTRATION_CLOSED: 'error.registrationClosed',
  TOO_MANY_ATTEMPTS: 'error.tooManySignIns',
  PASSKEY_REQUEST_INVALID: 'error.passkeyInvalid',
  PASSKEY_CHALLENGE_EXPIRED: 'error.passkeyExpired',
  PASSKEY_UNVERIFIED: 'error.passkeyFailed',
  PASSKEY_UNKNOWN: 'error.passkeyUnknown',
  PASSKEY_START_FAILED: 'error.passkeyStart',
  PASSKEY_NOT_FOR_ADMIN: 'error.passkeyNotForAdmin',
  PASSKEY_NOT_FOR_GUEST: 'error.passkeyNotForGuest',
  PASSKEY_ALREADY_ADDED: 'error.passkeyAlreadyAdded',
  DEMO_UNAVAILABLE: 'error.demoUnavailable',
  DEMO_BUSY: 'error.demoBusy',
  NOT_A_GUEST: 'error.notAGuest',
  GUEST_SESSION_ENDED: 'error.guestEnded',
} as const satisfies Record<SignInErrorCode, MessageKey>;

/** Answers the server marks with a machine-readable `code`. */
const BY_CODE: Readonly<Record<string, MessageKey>> = {
  ...SIGN_IN_MESSAGES,
  DUPLICATE_BILLING_RECORD: 'error.duplicateBill',
  ENCRYPTION_NOT_CONFIGURED: 'error.encryptionUnavailable',
  NOT_A_PDF: 'error.notPdf',
  DOCUMENT_TOO_LARGE: 'error.pdfTooLarge',
  TOO_MANY_PAGES: 'error.pdfTooManyPages',
  UNREADABLE_DOCUMENT: 'error.pdfUnreadable',
  EXTRACTION_BUSY: 'error.pdfBusy',
  RATE_LIMITED: 'error.pdfRateLimited',
};

/**
 * Messages the server words in English and sends without a code. Their text in the English catalog is the
 * server's own, so the message is recognised by it.
 */
const SERVER_TEXT_KEYS: readonly MessageKey[] = ['error.server', 'error.invalidRequest'];

const KEY_BY_SERVER_TEXT = new Map<string, MessageKey>(SERVER_TEXT_KEYS.map((key) => [String(catalogs.en[key]), key]));

const asRecord = (body: unknown): Record<string, unknown> => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {});

/** The sentence the server wrote, if it wrote one. */
export function writtenByServer(body: unknown): string {
  const { error } = asRecord(body);
  return typeof error === 'string' ? error.trim() : '';
}

/** Our own words for an answer we recognise (by its code, or by the sentence the server always uses for it), else null. */
export function knownServerMessage(body: unknown, t: Translate, locale: Locale = activeLocale() ?? 'en'): string | null {
  const { code, availableUnits } = asRecord(body);
  if (code === 'INSUFFICIENT_HOLDINGS') {
    return typeof availableUnits === 'number' && availableUnits > 0 ? t('tx.canSellAtMost', { units: availableUnits }) : t('tx.notHeld');
  }
  if (code === 'INSUFFICIENT_CASH') {
    const { currency, availableMinor } = asRecord(body);
    const code3 = typeof currency === 'string' ? currency : '';
    return typeof availableMinor === 'number' && availableMinor > 0 && code3 !== ''
      ? t('tx.notEnoughCash', { amount: formatMinor(availableMinor, code3, intlLocale(locale)) })
      : t('tx.noCash', { currency: code3 });
  }
  if (code === 'TRANSACTION_REQUIRED_BY_LATER') return requiredByLaterMessage(body, t, locale);
  if (typeof code === 'string' && code in BY_CODE) return t(BY_CODE[code]);
  const known = KEY_BY_SERVER_TEXT.get(writtenByServer(body));
  return known ? t(known) : null;
}

const KIND_WORDS = { BOUGHT: 'tx.kind.bought', SOLD: 'tx.kind.sold', DEPOSIT: 'tx.kind.deposit', WITHDRAWAL: 'tx.kind.withdraw' } as const;

/** A change that a later transaction depends on: the answer names that transaction, so the sentence says which one to change first. */
function requiredByLaterMessage(body: unknown, t: Translate, locale: Locale): string | null {
  const answer = transactionRequiredByLaterErrorResponse.safeParse(body);
  if (!answer.success) return null;
  const { type, symbol, date } = answer.data.dependent;
  const params = { kind: t(KIND_WORDS[type]), symbol, date: formatCalendarDate(date, intlLocale(locale)) };
  return type === 'BOUGHT' || type === 'SOLD' ? t('error.requiredByLater', params) : t('error.requiredByLaterCash', params);
}

/**
 * What the server said, in words the person can read. In English the server's own sentence is the most exact one, so it
 * is kept. In another language an answer we recognise is shown in our own words, and one we do not gets the generic
 * message given as `fallback`: a sentence in the wrong language helps nobody.
 */
export function serverMessage(body: unknown, { t, locale }: Words, fallback: MessageKey): string {
  const written = writtenByServer(body);
  if (locale === 'en' && written !== '') return written;
  return knownServerMessage(body, t, locale) ?? t(fallback);
}

/** The words of the language chosen on screen, for code that has no component to ask (the API boundary). */
export function currentWords(): Words {
  const locale = activeLocale() ?? 'en';
  return { t: translatorFor(locale), locale };
}
