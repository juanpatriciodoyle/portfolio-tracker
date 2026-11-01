import { describe, expect, it } from 'vitest';
import { clampDateYear, keepDecimal, keepDigits, keepNameCharacters } from '../inputFilters';

describe('keepDecimal', () => {
  it.each([
    ['48.50', '48.50'],
    ['48,50', '48,50'],
    ['3,200', '3,200'],
    ['abc12x', '12'],
    ['€1 200', '1200'],
    ['-5', '5'],
    ['1.2.3', '1.23'],
    ['1,2,3', '1,23'],
    ['', ''],
  ])('%s becomes %s', (typed, kept) => {
    expect(keepDecimal(typed)).toBe(kept);
  });
});

describe('keepDigits', () => {
  it.each([
    ['1990', undefined, '1990'],
    ['19a9b0', undefined, '1990'],
    ['199012', 4, '1990'],
    ['', 4, ''],
    ['1.5', undefined, '15'],
  ])('%s (max %s) becomes %s', (typed, max, kept) => {
    expect(keepDigits(typed, max)).toBe(kept);
  });
});

describe('keepNameCharacters', () => {
  it.each([
    ['Juan Patricio', 'Juan Patricio'],
    ['Ana-María', 'Ana-María'],
    ["O'Brien", "O'Brien"],
    ['Jean-Luc Picard Jr.', 'Jean-Luc Picard Jr.'],
    ['São Paulo', 'São Paulo'],
    ['Zürich', 'Zürich'],
    ['Madrid2', 'Madrid'],
    ['4D', 'D'],
    ['Ba$rce@lona', 'Barcelona'],
    ['', ''],
  ])('%s becomes %s', (typed, kept) => {
    expect(keepNameCharacters(typed)).toBe(kept);
  });
});

describe('clampDateYear', () => {
  it.each([
    ['2026-10-31', '2026-10-31'],
    ['12345-10-31', '1234-10-31'],
    ['202611-01-01', '2026-01-01'],
    ['', ''],
  ])('%s becomes %s', (typed, kept) => {
    expect(clampDateYear(typed)).toBe(kept);
  });
});
