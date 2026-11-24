import { describe, it, expect, afterEach } from 'vitest';
import { formatCurrency, formatPercent } from '../../data/sampleChartData';
import { displayLocale, formatCount, formatMinor, formatCalendarDate, splitCents } from '../../lib/money';
import { setActiveLocale } from '../activeLocale';

afterEach(() => setActiveLocale(null));

describe('formatting follows the chosen language', () => {
  it('formats amounts the English way by default', () => {
    setActiveLocale('en');
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatPercent(1.234)).toBe('+1.23%');
    expect(formatCount(1284)).toBe('1,284');
  });

  it('formats amounts the Argentine way: dot for thousands, comma for decimals', () => {
    setActiveLocale('es-AR');
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1.234,50');
    expect(formatPercent(1.234)).toBe('+1,23%');
    expect(formatCount(1284)).toBe('1.284');
  });

  it('keeps the minus sign of a loss', () => {
    setActiveLocale('es-AR');
    expect(formatCurrency(-1234.5, 'EUR')).toBe('-€1.234,50');
    expect(formatPercent(-0.5)).toBe('-0,50%');
  });

  it('writes dates the Argentine way', () => {
    setActiveLocale('es-AR');
    expect(formatCalendarDate('2024-03-01')).toMatch(/^1\s+mar\.?\s+2024$|^1 de mar\.? de 2024$/);
  });

  it('keeps an explicit locale over the chosen one', () => {
    setActiveLocale('es-AR');
    expect(formatMinor(12345, 'EUR', 'en-US')).toBe('€123.45');
  });

  it('falls back to the browser language until a choice is made', () => {
    setActiveLocale(null);
    expect(displayLocale()).toBe(navigator.language || 'en-US');
  });

  it('cuts the cents off an amount written with a decimal comma', () => {
    expect(splitCents('€1.234,56')).toEqual({ whole: '€1.234', cents: ',56' });
    expect(splitCents('€1,234.56')).toEqual({ whole: '€1,234', cents: '.56' });
    expect(splitCents('1.234,56 €')).toEqual({ whole: '1.234,56 €', cents: '' });
  });
});
