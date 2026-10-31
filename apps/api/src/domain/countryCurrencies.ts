const EURO_AREA = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

/**
 * The currency each well-known country uses. Statistics (PPP factors, income distributions) are in that currency, so an
 * income written in another one cannot be compared with them directly. Countries not listed are given the benefit of the doubt.
 */
const LOCAL_CURRENCY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO_AREA.map((code) => [code, 'EUR'])),
  AE: 'AED', AR: 'ARS', AU: 'AUD', BG: 'BGN', BR: 'BRL', CA: 'CAD', CH: 'CHF', CL: 'CLP', CN: 'CNY', CO: 'COP', CZ: 'CZK',
  DK: 'DKK', GB: 'GBP', HK: 'HKD', HU: 'HUF', IL: 'ILS', IN: 'INR', IS: 'ISK', JP: 'JPY', KR: 'KRW', MX: 'MXN', NO: 'NOK',
  NZ: 'NZD', PE: 'PEN', PL: 'PLN', RO: 'RON', SE: 'SEK', SG: 'SGD', TH: 'THB', TR: 'TRY', US: 'USD', UY: 'UYU', ZA: 'ZAR',
};

/** True unless the country is known to use a different currency. */
export function isLocalCurrency(countryCode: string, currency: string): boolean {
  const local = LOCAL_CURRENCY[countryCode];
  return local === undefined || local === currency;
}
