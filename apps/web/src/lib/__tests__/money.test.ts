import { describe, it, expect } from 'vitest';
import {
  currencyExponent,
  displayLocale,
  formatCalendarDate,
  formatMinor,
  formatMonthYear,
  formatPercent,
  formatPhaseRange,
  formatSignedMinor,
  minorToInputString,
  parseMajorToMinor,
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

describe('formatMinor', () => {
  it('drops the cents on whole amounts', () => {
    expect(formatMinor(120000, 'EUR', 'en-US')).toBe('€1,200');
  });

  it('keeps the cents when there are some', () => {
    expect(formatMinor(120050, 'EUR', 'en-US')).toBe('€1,200.50');
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
