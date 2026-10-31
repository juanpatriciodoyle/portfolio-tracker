import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES } from '../../data/countries';
import { countryName, countryOptions, flagEmoji } from '../countries';
import { currencyOptions } from '../currencies';
import { barWidthPercent } from '../scale';

describe('country list', () => {
  it('holds the 249 ISO codes exactly once each', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
  });

  it('knows a name for every code, which catches typos in the list', () => {
    for (const code of COUNTRY_CODES) {
      expect(countryName(code, 'en')).not.toBe(code);
    }
  });

  it('names countries in the requested language and falls back to the code', () => {
    expect(countryName('ES', 'en')).toBe('Spain');
    expect(countryName('ES', 'es')).toBe('España');
    expect(countryName('??', 'en')).toBe('??');
  });

  it('sorts options by name', () => {
    const names = countryOptions('en').map((option) => option.name);

    expect(names[0]).toBe('Afghanistan');
    expect([...names].sort(new Intl.Collator('en').compare)).toEqual(names);
  });

  it('turns a code into a flag', () => {
    expect(flagEmoji('ES')).toBe('🇪🇸');
    expect(flagEmoji('es')).toBe('');
  });
});

describe('currency options', () => {
  it('puts the common currencies first and labels them with their names', () => {
    const options = currencyOptions('en');

    expect(options.slice(0, 3).map((option) => option.code)).toEqual(['EUR', 'USD', 'GBP']);
    expect(options[0].label).toBe('EUR · Euro');
    expect(options.find((option) => option.code === 'ARS')?.label).toBe('ARS · Argentine Peso');
  });

  it('lists each currency once', () => {
    const codes = currencyOptions('en').map((option) => option.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('barWidthPercent', () => {
  it('scales against the largest value', () => {
    expect(barWidthPercent(50, 100)).toBe(50);
    expect(barWidthPercent(100, 100)).toBe(100);
  });

  it('never goes negative, past full, or divides by zero', () => {
    expect(barWidthPercent(-5, 100)).toBe(0);
    expect(barWidthPercent(0, 100)).toBe(0);
    expect(barWidthPercent(5, 0)).toBe(0);
    expect(barWidthPercent(150, 100)).toBe(100);
  });
});
