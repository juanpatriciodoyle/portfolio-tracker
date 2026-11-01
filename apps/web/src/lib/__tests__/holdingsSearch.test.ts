import { describe, it, expect } from 'vitest';
import { matchesHoldingsQuery } from '../holdingsSearch';

const apple = { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' };
const bank = { symbol: 'SAN.MC', name: 'Banco Santander', sector: 'Financials' };

describe('matchesHoldingsQuery', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesHoldingsQuery(apple, '')).toBe(true);
    expect(matchesHoldingsQuery(apple, '   ')).toBe(true);
  });

  it('matches ticker, name and sector without a mode, ignoring case', () => {
    expect(matchesHoldingsQuery(apple, 'aapl')).toBe(true);
    expect(matchesHoldingsQuery(apple, 'APPLE')).toBe(true);
    expect(matchesHoldingsQuery(apple, 'tech')).toBe(true);
    expect(matchesHoldingsQuery(bank, 'financ')).toBe(true);
  });

  it('ignores accents', () => {
    expect(matchesHoldingsQuery({ symbol: 'X', name: 'Cañada Éxito', sector: 'Retail' }, 'canada exito')).toBe(true);
  });

  it('requires every word to match somewhere', () => {
    expect(matchesHoldingsQuery(apple, 'apple tech')).toBe(true);
    expect(matchesHoldingsQuery(apple, 'apple financials')).toBe(false);
  });

  it('does not match unrelated text', () => {
    expect(matchesHoldingsQuery(apple, 'bitcoin')).toBe(false);
  });
});
