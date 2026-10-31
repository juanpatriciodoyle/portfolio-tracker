import { displayLocale } from './money';

export interface CurrencyOption {
  code: string;
  label: string;
}

/** Offered first, so the usual suspects are one glance away. */
const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'ARS', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'JPY', 'CNY', 'INR', 'CAD', 'AUD'];

function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function allCurrencyCodes(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : COMMON_CURRENCIES;
}

/** Common currencies first, then every other one the browser knows, each as "EUR · Euro". */
export function currencyOptions(locale: string = displayLocale()): CurrencyOption[] {
  const others = allCurrencyCodes().filter((code) => !COMMON_CURRENCIES.includes(code));
  return [...COMMON_CURRENCIES, ...others].map((code) => ({ code, label: `${code} · ${currencyName(code, locale)}` }));
}
