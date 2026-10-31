/** Codes printed on bills that this engine recognises. Anything else stays blank for the person to fill in. */
export const KNOWN_CURRENCIES: ReadonlySet<string> = new Set([
  'EUR', 'USD', 'GBP', 'ARS', 'MXN', 'BRL', 'CLP', 'COP', 'UYU', 'PEN', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'INR', 'ZAR', 'AED', 'SGD', 'HKD', 'KRW', 'THB',
]);

/** Currencies written with a plain "$": a bare dollar sign does not say which one, so the living phase decides. */
export const DOLLAR_SIGN_CURRENCIES: ReadonlySet<string> = new Set(['USD', 'ARS', 'MXN', 'CLP', 'COP', 'UYU', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD']);

/** Digits after the decimal point in the currency's minor unit (EUR 2, JPY 0, KWD 3). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

const EXPLICIT_MARKS: ReadonlyArray<readonly [string, string]> = [
  ['us$', 'USD'],
  ['u$s', 'USD'],
  ['ar$', 'ARS'],
  ['mx$', 'MXN'],
  ['r$', 'BRL'],
  ['ca$', 'CAD'],
  ['c$', 'CAD'],
  ['au$', 'AUD'],
  ['a$', 'AUD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
];

const WORD_MARKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(euros?)\b/i, 'EUR'],
  [/^(pounds?)\b/i, 'GBP'],
];

export type CurrencyMark = { currency: string } | { dollarSign: true };

/** The currency written right before an amount, if any. */
export function markBefore(before: string): CurrencyMark | null {
  const tail = before.trimEnd().toLowerCase();
  for (const [symbol, currency] of EXPLICIT_MARKS) if (tail.endsWith(symbol)) return { currency };
  const code = /(?:^|[^A-Za-z])([A-Z]{3})$/.exec(before.trimEnd());
  if (code && KNOWN_CURRENCIES.has(code[1])) return { currency: code[1] };
  return tail.endsWith('$') ? { dollarSign: true } : null;
}

/** The currency written right after an amount, if any. */
export function markAfter(after: string): CurrencyMark | null {
  const head = after.trimStart();
  const lower = head.toLowerCase();
  for (const [symbol, currency] of EXPLICIT_MARKS) if (lower.startsWith(symbol)) return { currency };
  for (const [pattern, currency] of WORD_MARKS) if (pattern.test(head)) return { currency };
  const code = /^([A-Z]{3})(?![A-Za-z])/.exec(head);
  if (code && KNOWN_CURRENCIES.has(code[1])) return { currency: code[1] };
  return head.startsWith('$') ? { dollarSign: true } : null;
}
