import { describe, it, expect } from 'vitest';
import {
  currencyExponent,
  currencySign,
  displayLocale,
  formatCalendarDate,
  formatCount,
  formatFixed,
  formatUpTo,
  monthNames,
  formatMinor,
  formatMoney,
  formatMonthYear,
  formatPercent,
  formatPhaseRange,
  formatSignedMinor,
  minorToInputString,
  parseMajorToMinor,
  splitCents,
} from '../money';

describe('currencyExponent', () => {
  it.each([
    ['EUR', 2],
    ['USD', 2],
    ['JPY', 0],
    ['KWD', 3],
  ])('%s has %d minor-unit digits', (currency, expected) => {
    expect(currencyExponent(currency)).toBe(expected);
  });

  it('falls back to 2 for something that is not a currency code', () => {
    expect(currencyExponent('EURO')).toBe(2);
    expect(currencyExponent('')).toBe(2);
  });
});

describe('formatMoney: the amounts of the home screen', () => {
  it('keeps the cents under 1,000', () => {
    expect(formatMoney(93.4, 'EUR', { locale: 'en-US' })).toBe('€93.40');
    expect(formatMoney(999.99, 'EUR', { locale: 'en-US' })).toBe('€999.99');
  });

  it('shows no cents from 1,000 up, rounding the amount to the nearest unit', () => {
    expect(formatMoney(1000, 'EUR', { locale: 'en-US' })).toBe('€1,000');
    expect(formatMoney(468414.03, 'EUR', { locale: 'en-US' })).toBe('€468,414');
    expect(formatMoney(1234.56, 'EUR', { locale: 'en-US' })).toBe('€1,235');
  });

  it('writes a loss with the sign first, in one format whatever the size', () => {
    expect(formatMoney(-1800, 'EUR', { locale: 'en-US' })).toBe('-€1,800');
    expect(formatMoney(-88171.4, 'EUR', { locale: 'en-US' })).toBe('-€88,171');
    expect(formatMoney(-12.5, 'EUR', { locale: 'en-US' })).toBe('-€12.50');
  });

  it('adds a plus to a gain only when asked, and never to zero', () => {
    expect(formatMoney(108365.2, 'EUR', { signed: true, locale: 'en-US' })).toBe('+€108,365');
    expect(formatMoney(-50, 'EUR', { signed: true, locale: 'en-US' })).toBe('-€50.00');
    expect(formatMoney(0, 'EUR', { signed: true, locale: 'en-US' })).toBe('€0.00');
  });

  it('follows the language: Argentine Spanish groups with dots and puts the sign first', () => {
    expect(formatMoney(1234.56, 'EUR', { locale: 'es-AR' })).toMatch(/^€\s?1\.235$/);
    expect(formatMoney(-1800, 'EUR', { locale: 'es-AR' })).toMatch(/^-€\s?1\.800$/);
  });

  it('uses the currency of the account and its own number of decimals', () => {
    expect(formatMoney(93.4, 'USD', { locale: 'en-US' })).toBe('$93.40');
    expect(formatMoney(5000, 'JPY', { locale: 'en-US' })).toBe('¥5,000');
  });
});

describe('formatMinor', () => {
  it('has no cents from 1,000 up, the same rule as the home screen', () => {
    expect(formatMinor(143285_15, 'EUR', 'en-US')).toBe('€143,285');
    expect(formatMinor(999_50, 'EUR', 'en-US')).toBe('€999.50');
  });

  it('drops the cents on whole amounts', () => {
    expect(formatMinor(120000, 'EUR', 'en-US')).toBe('€1,200');
  });

  it('keeps the cents when there are some and the amount is under 1,000', () => {
    expect(formatMinor(80050, 'EUR', 'en-US')).toBe('€800.50');
    expect(formatMinor(120050, 'EUR', 'en-US')).toBe('€1,201');
  });

  it('respects currencies without decimals', () => {
    expect(formatMinor(5000, 'JPY', 'en-US')).toBe('¥5,000');
  });

  it('formats zero and negative amounts', () => {
    expect(formatMinor(0, 'EUR', 'en-US')).toBe('€0');
    expect(formatMinor(-4550, 'EUR', 'en-US')).toBe('-€45.50');
  });

  it('uses the browser language when no locale is given', () => {
    expect(formatMinor(120000, 'EUR')).toBe(formatMinor(120000, 'EUR', displayLocale()));
  });
});

describe('formatSignedMinor', () => {
  it('always shows the direction of a change, except for zero', () => {
    expect(formatSignedMinor(15000, 'EUR', 'en-US')).toBe('+€150');
    expect(formatSignedMinor(-15000, 'EUR', 'en-US')).toBe('-€150');
    expect(formatSignedMinor(0, 'EUR', 'en-US')).toBe('€0');
  });
});

describe('formatPercent', () => {
  it('rounds to whole percents unless asked for more', () => {
    expect(formatPercent(0.53125, 'en-US')).toBe('53%');
    expect(formatPercent(0.12345, 'en-US', 1)).toBe('12.3%');
    expect(formatPercent(-0.12, 'en-US')).toBe('-12%');
  });
});

describe('parseMajorToMinor', () => {
  it.each([
    ['1200', 'EUR', 120000],
    ['1200.5', 'EUR', 120050],
    ['1200,5', 'EUR', 120050],
    ['1.234,56', 'EUR', 123456],
    ['1,234.56', 'EUR', 123456],
    ['1,234', 'EUR', 123400],
    ['1.234', 'EUR', 123400],
    ['1,234,567', 'EUR', 123456700],
    ['€ 3.200,00', 'EUR', 320000],
    ['$3,200.5', 'USD', 320050],
    ['0,5', 'EUR', 50],
    ['.5', 'EUR', 50],
    ['0', 'EUR', 0],
    ['  42  ', 'EUR', 4200],
    ['007', 'EUR', 700],
    ['1234', 'JPY', 1234],
    ['1,234', 'JPY', 1234],
    ['12.00', 'JPY', 12],
    ['1,234', 'KWD', 1234],
  ])('reads %p in %s as %d minor units', (text, currency, expected) => {
    expect(parseMajorToMinor(text, currency)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    '-5',
    '1.2.3',
    '1,23,456',
    '12.345,678',
    '1.234,5,6',
    '12 apples',
    '1e5',
    '€',
  ])('rejects %p', (text) => {
    expect(parseMajorToMinor(text, 'EUR')).toBeNull();
  });

  it('rejects fractions the currency cannot hold', () => {
    expect(parseMajorToMinor('12.50', 'JPY')).toBeNull();
  });

  it('rejects numbers too large to be exact', () => {
    expect(parseMajorToMinor('99999999999999999999', 'EUR')).toBeNull();
  });
});

describe('minorToInputString', () => {
  it.each([
    [320000, 'EUR', '3200'],
    [320050, 'EUR', '3200.50'],
    [5, 'EUR', '0.05'],
    [0, 'EUR', '0'],
    [5000, 'JPY', '5000'],
    [1234, 'KWD', '1.234'],
  ])('shows %d %s as %p', (amountMinor, currency, expected) => {
    expect(minorToInputString(amountMinor, currency)).toBe(expected);
  });

  it('round-trips through parseMajorToMinor', () => {
    for (const amountMinor of [0, 1, 99, 100, 123456, 1000000000]) {
      expect(parseMajorToMinor(minorToInputString(amountMinor, 'EUR'), 'EUR')).toBe(amountMinor);
    }
  });
});

describe('calendar dates', () => {
  it('formats the day exactly as given, whatever the browser time zone', () => {
    expect(formatCalendarDate('2024-03-01', 'en-US')).toBe('Mar 1, 2024');
    expect(formatCalendarDate('2024-01-01', 'en-US')).toBe('Jan 1, 2024');
    expect(formatCalendarDate('2023-12-31', 'en-US')).toBe('Dec 31, 2023');
  });

  it('formats a month and year', () => {
    expect(formatMonthYear('2022-09-01', 'en-US')).toBe('Sep 2022');
  });

  it('describes an open-ended phase as running until now', () => {
    expect(formatPhaseRange('2022-09-01', null, 'en-US')).toBe('Sep 2022 – now');
  });

  it('describes a finished phase by its first and last month', () => {
    expect(formatPhaseRange('2022-09-01', '2024-03-31', 'en-US')).toBe('Sep 2022 – Mar 2024');
  });

  it('collapses a phase inside one month to that month', () => {
    expect(formatPhaseRange('2022-09-01', '2022-09-30', 'en-US')).toBe('Sep 2022');
  });

  it('lets the caller word the open end differently', () => {
    expect(formatPhaseRange('2027-03-01', null, 'en-US', 'open')).toBe('Mar 2027 – open');
  });
});

describe('splitCents', () => {
  it.each([
    ['€468,414.03', { whole: '€468,414', cents: '.03' }],
    ['€1.234,56', { whole: '€1.234', cents: ',56' }],
    ['-€88,171.00', { whole: '-€88,171', cents: '.00' }],
    ['+€4,900.50', { whole: '+€4,900', cents: '.50' }],
  ])('splits "%s" into the whole part and the cents', (text, expected) => {
    expect(splitCents(text)).toEqual(expected);
  });

  it('leaves a figure with no cents whole', () => {
    expect(splitCents('€468,414')).toEqual({ whole: '€468,414', cents: '' });
    expect(splitCents('€1,234')).toEqual({ whole: '€1,234', cents: '' });
  });
});

describe('formatCount', () => {
  it('groups thousands the way the locale does', () => {
    expect(formatCount(1284, 'en-US')).toBe('1,284');
    expect(formatCount(1284, 'es-ES')).toBe('1284');
    expect(formatCount(1284, 'de-DE')).toBe('1.284');
  });

  it('rounds, because a figure on its way up is not a whole number', () => {
    expect(formatCount(41.6, 'en-US')).toBe('42');
  });

  it('shows zero as zero', () => {
    expect(formatCount(0, 'en-US')).toBe('0');
  });
});

describe('formatFixed, formatUpTo and monthNames follow the language', () => {
  it('writes a fixed number of decimals', () => {
    expect(formatFixed(1234.5, 2, 'en-US')).toBe('1,234.50');
    expect(formatFixed(1234.5, 2, 'es-AR')).toBe('1.234,50');
    expect(formatFixed(0.05, 1, 'es-AR')).toBe('0,1');
  });

  it('writes at most some decimals, never trailing zeros', () => {
    expect(formatUpTo(12.5, 2, 'en-US')).toBe('12.5');
    expect(formatUpTo(0.123456789, 6, 'es-AR')).toBe('0,123457');
    expect(formatUpTo(3, 2, 'es-AR')).toBe('3');
  });

  it('names the months in the language', () => {
    expect(monthNames('short', 'en-US')).toHaveLength(12);
    expect(monthNames('short', 'en-US')[0]).toBe('Jan');
    expect(monthNames('long', 'en-US')[11]).toBe('December');
    expect(monthNames('long', 'es-AR')[0]).toBe('enero');
    expect(monthNames('long', 'es-AR')[11]).toBe('diciembre');
  });
});

describe('currency signs in Argentine Spanish', () => {
  it('writes the sign people write, where the language only knows the code', () => {
    expect(formatMinor(90000, 'EUR', 'es-AR')).toMatch(/^€\s900$/);
    expect(formatMinor(12345, 'GBP', 'es-AR')).toMatch(/^£\s123,45$/);
  });

  it('keeps US$ for dollars and $ for pesos, never confusing the two', () => {
    expect(formatMinor(100000, 'USD', 'es-AR')).toMatch(/^US\$\s1\.000$/);
    expect(formatMinor(100000, 'ARS', 'es-AR')).toMatch(/^\$\s1\.000$/);
  });

  it('leaves English as it was', () => {
    expect(formatMinor(90000, 'EUR', 'en-US')).toBe('€900');
    expect(formatSignedMinor(15000, 'EUR', 'en-US')).toBe('+€150');
  });
});

describe('currencySign: the sign people write before an amount', () => {
  it.each([
    ['EUR', 'en-US', '€'],
    ['USD', 'en-US', '$'],
    ['GBP', 'en-US', '£'],
    ['EUR', 'es-AR', '€'],
    // Where "$" means pesos, a dollar amount keeps its "US$".
    ['USD', 'es-AR', 'US$'],
  ])('%s in %s is %s', (currency, locale, sign) => {
    expect(currencySign(currency, locale)).toBe(sign);
  });

  it('falls back to the code for a currency it does not know', () => {
    expect(currencySign('XXX', 'en-US')).toBeTruthy();
    expect(currencySign('not a currency', 'en-US')).toBe('not a currency');
  });
});
