/**
 * Display helpers for money and calendar days. Formatting and parsing only: the API owns every
 * calculation, so nothing here adds, converts or compares amounts.
 */

/** Matches the browser's language; falls back to English where there is no navigator. */
export function displayLocale(): string {
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

function formatCurrency(amountMinor: number, currency: string, locale: string, signed: boolean): string {
  const exponent = currencyExponent(currency);
  const isWhole = amountMinor % 10 ** exponent === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : exponent,
    maximumFractionDigits: exponent,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(amountMinor / 10 ** exponent);
}

/** "€1,200" for whole amounts, "€1,200.50" when there are cents. */
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
