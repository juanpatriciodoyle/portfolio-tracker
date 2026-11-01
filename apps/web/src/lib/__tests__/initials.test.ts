import { describe, expect, it } from 'vitest';
import { initialsOf } from '../initials';

describe('initialsOf', () => {
  it('takes the first and the last name', () => {
    expect(initialsOf('Juan Patricio Doyle')).toBe('JD');
    expect(initialsOf('Juan Doyle')).toBe('JD');
  });

  it('uses one letter for a single name', () => {
    expect(initialsOf('juan')).toBe('J');
  });

  it('ignores extra spaces and upper-cases', () => {
    expect(initialsOf('  ana   de la cruz ')).toBe('AC');
  });

  it('is empty without a name', () => {
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('keeps an accented or astral first letter whole', () => {
    expect(initialsOf('émile zola')).toBe('ÉZ');
    expect(initialsOf('𠮷野 家')).toBe('𠮷家');
  });
});
