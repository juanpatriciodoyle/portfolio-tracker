/**
 * Display helpers for money and calendar days. Formatting and parsing only: the API owns every
 * calculation, so nothing here adds, converts or compares amounts.
 */
import { activeLocale } from '../i18n/activeLocale';
import { intlLocale } from '../i18n/locale';

/**
 * The language numbers and dates are written in: the one the person chose in the app, else the
 * browser's, else English. Every formatter below takes a locale and uses this as its default, so
 * switching language changes them all from one place.
 */
export function displayLocale(): string {
  const chosen = activeLocale();
  if (chosen) return intlLocale(chosen);
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}

/** How many digits follow the decimal point in the currency's minor unit (EUR 2, JPY 0, KWD 3). */
export function currencyExponent(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

const symbolChoices = new Map<string, 'symbol' | 'narrowSymbol'>();

/**
 * Some languages only know a currency by its code ("EUR 900" in Argentine Spanish) where people write its sign ("€ 900").
 * Then the one-character sign is used. "$" stays out of it: where it means pesos, a dollar amount must keep its "US$".
 */
function currencyDisplayFor(currency: string, locale: string): 'symbol' | 'narrowSymbol' {
  const memo = `${locale}|${currency}`;
  const known = symbolChoices.get(memo);
  if (known) return known;
  const signOf = (currencyDisplay: 'symbol' | 'narrowSymbol') => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay }).formatToParts(0).find((part) => part.type === 'currency')?.value;
    } catch {
      return undefined;
    }
  };
  const narrow = signOf('narrowSymbol');
  const choice = signOf('symbol') === currency && narrow !== undefined && narrow.length === 1 && narrow !== '$' ? 'narrowSymbol' : 'symbol';
  symbolChoices.set(memo, choice);
  return choice;
}

/** The sign written before an amount in this currency ("€", "$", "US$" where "$" means pesos); the code itself when the currency is unknown. */
export function currencySign(currency: string, locale: string = displayLocale()): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: currencyDisplayFor(currency, locale) }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** From this size up an amount is read in whole units: the cents are noise next to thousands. */
export const CENTS_HIDDEN_FROM = 1000;

const hidesCents = (amount: number): boolean => Math.abs(amount) >= CENTS_HIDDEN_FROM;

function formatCurrency(amountMinor: number, currency: string, locale: string, signed: boolean): string {
  const exponent = currencyExponent(currency);
  const isWhole = amountMinor % 10 ** exponent === 0;
  const digits = isWhole || hidesCents(amountMinor / 10 ** exponent) ? 0 : exponent;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: currencyDisplayFor(currency, locale),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(amountMinor / 10 ** exponent);
}

/**
 * "€468,414" / "€93.40" / "-€1,800": an amount in whole currency units as the home screen writes it. Under 1,000 it keeps its cents,
 * from 1,000 up it has none, and a loss is always "-€1,800" (the sign first), never "€-1,800". `signed` adds "+" to a gain.
 */
export function formatMoney(amount: number, currency: string, { signed = false, locale = displayLocale() }: { signed?: boolean; locale?: string } = {}): string {
  const digits = hidesCents(amount) ? 0 : currencyExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: currencyDisplayFor(currency, locale),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(amount);
}

/** "€1,200" for whole amounts, "€12.50" when there are cents; from 1,000 up there are never cents. */
export function formatMinor(amountMinor: number, currency: string, locale: string = displayLocale()): string {
  return formatCurrency(amountMinor, currency, locale, false);
}

/** Like formatMinor but always shows the direction of a change: "+€150", "-€150". */
export function formatSignedMinor(amountMinor: number, currency: string, locale: string = displayLocale()): string {
  return formatCurrency(amountMinor, currency, locale, true);
}

/** "53%" for 0.53125; pass more fraction digits for finer detail. */
export function formatPercent(fraction: number, locale: string = displayLocale(), maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits }).format(fraction);
}

/** "1,284": a whole count with the locale's grouping. A figure on its way up is rounded first. */
export function formatCount(value: number, locale: string = displayLocale()): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** "1,234.50" / "1.234,50": a number with exactly this many decimals, grouped the way the language groups. */
export function formatFixed(value: number, fractionDigits: number, locale: string = displayLocale()): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

/** "12.5" / "12,5": a number with at most this many decimals and no trailing zeros. */
export function formatUpTo(value: number, maxFractionDigits: number, locale: string = displayLocale()): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** The twelve month names, January first: "Jan" / "ene" short, "January" / "enero" long. */
export function monthNames(width: 'short' | 'long', locale: string = displayLocale()): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, month) => format.format(new Date(Date.UTC(2024, month, 15))));
}

/** Amount for an editable field: "3200" or "3200.50", no grouping and no currency symbol. */
export function minorToInputString(amountMinor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, '0');
  const integerPart = digits.slice(0, digits.length - exponent);
  const fractionPart = exponent === 0 ? '' : digits.slice(-exponent);
  const fraction = /^0*$/.test(fractionPart) ? '' : `.${fractionPart}`;
  return `${amountMinor < 0 ? '-' : ''}${integerPart}${fraction}`;
}

const CURRENCY_MARK = String.raw`(?:\p{Sc}|[A-Za-z]{3})`;
const AMOUNT_PATTERN = new RegExp(`^${CURRENCY_MARK}?\\s*([\\d.,]*\\d[\\d.,]*)\\s*${CURRENCY_MARK}?$`, 'u');

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isGrouped(integerPart: string, separator: string): boolean {
  return new RegExp(`^\\d{1,3}(?:${escapeForRegExp(separator)}\\d{3})*$`).test(integerPart);
}

/**
 * Reads what a person types into an amount field ("1.234,56", "1,234.56", "€ 3200") as minor
 * units, or null when it is not an amount this currency can hold. A lone separator followed by
 * exactly three digits counts as a thousands mark, unless the currency has three decimals.
 */
export function parseMajorToMinor(text: string, currency: string): number | null {
  const exponent = currencyExponent(currency);
  const match = AMOUNT_PATTERN.exec(text.trim());
  if (!match) return null;
  const core = match[1];

  const lastDot = core.lastIndexOf('.');
  const lastComma = core.lastIndexOf(',');
  let integerDigits: string;
  let fractionDigits = '';

  if (lastDot === -1 && lastComma === -1) {
    integerDigits = core;
  } else if (lastDot !== -1 && lastComma !== -1) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const thousandsSeparator = core[decimalIndex] === '.' ? ',' : '.';
    const integerPart = core.slice(0, decimalIndex);
    if (!isGrouped(integerPart, thousandsSeparator)) return null;
    integerDigits = integerPart.split(thousandsSeparator).join('');
    fractionDigits = core.slice(decimalIndex + 1);
  } else {
    const separator = lastDot !== -1 ? '.' : ',';
    const separatorIndex = core.lastIndexOf(separator);
    const before = core.slice(0, separatorIndex);
    const after = core.slice(separatorIndex + 1);
    const repeated = core.split(separator).length > 2;
    const looksLikeThousands = after.length === 3 && exponent !== 3 && isGrouped(core, separator);

    if (repeated || looksLikeThousands) {
      if (!isGrouped(core, separator)) return null;
      integerDigits = core.split(separator).join('');
    } else {
      integerDigits = before;
      fractionDigits = after;
    }
  }

  if (/[^0]/.test(fractionDigits.slice(exponent))) return null;
  const fraction = fractionDigits.slice(0, exponent).padEnd(exponent, '0');
  const minor = Number(`${integerDigits || '0'}${fraction}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

function parseCalendarDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Mar 1, 2024". Always formatted in UTC so a calendar day never shifts with the time zone. */
export function formatCalendarDate(date: string, locale: string = displayLocale()): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    parseCalendarDate(date)
  );
}

/** "Sep 2022". */
export function formatMonthYear(date: string, locale: string = displayLocale()): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseCalendarDate(date));
}

/** "Sep 2022 – now", "Sep 2022 – Mar 2024", or just "Sep 2022" for a phase inside one month. */
export function formatPhaseRange(
  startDate: string,
  endDate: string | null,
  locale: string = displayLocale(),
  openEndLabel = 'now'
): string {
  const start = formatMonthYear(startDate, locale);
  if (endDate === null) return `${start} – ${openEndLabel}`;
  const end = formatMonthYear(endDate, locale);
  return start === end ? start : `${start} – ${end}`;
}

/** A formatted amount cut into its whole part and its cents ("€468,414" + ".03"), so the cents can be drawn quieter. */
export function splitCents(formatted: string): { whole: string; cents: string } {
  const match = /^(.*?)([.,]\d{2})$/.exec(formatted);
  return match ? { whole: match[1], cents: match[2] } : { whole: formatted, cents: '' };
}
