import { describe, it, expect } from 'vitest';
import { catalogs } from '../catalogs';
import type { Locale } from '../locale';

/**
 * The words the product does not use for a concept that already has its one name (CLAUDE.md, "Languages").
 * A banned word in a screen text means one idea is called two things; fix the text, not this list.
 * `unless` lets a word stand inside its approved phrase ("Yearly return").
 */
interface Banned {
  readonly pattern: RegExp;
  readonly use: string;
}

const ENGLISH: readonly Banned[] = [
  { pattern: /\bP\/L\b|\bP&L\b|profit\/loss|profit and loss|net profit/i, use: 'Profit' },
  { pattern: /\bperformance\b/i, use: 'Profit (or Yearly return)' },
  { pattern: /\bgrowth\b/i, use: 'Profit, or Value over time' },
  { pattern: /(?<!yearly )\breturns?\b/i, use: 'Profit (only "Yearly return" is a return)' },
  { pattern: /\binvested\b/i, use: 'Holdings value, or Money you put in' },
  { pattern: /\bpositions?\b/i, use: 'Holdings' },
  { pattern: /holding period/i, use: 'Held' },
  { pattern: /net cash/i, use: 'What you paid / Money you put in' },
  { pattern: /\bMWR\b/, use: 'Yearly return' },
  { pattern: /\bbought\b/i, use: 'Buy' },
];

const SPANISH: readonly Banned[] = [
  { pattern: /\bcartera\b/i, use: 'portfolio' },
  { pattern: /\bposici[oó]n(es)?\b/i, use: 'tenencias' },
  { pattern: /\bcrecimiento\b|\bdesempe[ñn]o\b/i, use: 'ganancia, o Valor a lo largo del tiempo' },
  { pattern: /\brendimiento\b(?! anual)/i, use: 'ganancia (solo "Rendimiento anual" es un rendimiento)' },
  { pattern: /\binvertid[oa]s?\b/i, use: 'Valor de tus tenencias, o Dinero que pusiste' },
];

const textsOf = (message: string | { one: string; other: string }) => (typeof message === 'string' ? [message] : [message.one, message.other]);

function violations(locale: Locale, banned: readonly Banned[]): string[] {
  const found: string[] = [];
  for (const [key, message] of Object.entries(catalogs[locale])) {
    // Data labels name what the server sends (sectors, countries): their words are not ours to choose.
    if (key.startsWith('data.')) continue;
    for (const text of textsOf(message)) {
      for (const { pattern, use } of banned) {
        if (pattern.test(text)) found.push(`${key}: "${text}" uses a banned word; say ${use}`);
      }
    }
  }
  return found;
}

describe('the glossary', () => {
  it('keeps one name for each idea in the English texts', () => {
    expect(violations('en', ENGLISH)).toEqual([]);
  });

  it('keeps one name for each idea in the Argentine Spanish texts', () => {
    expect(violations('es-AR', SPANISH)).toEqual([]);
  });

  it('names the four transaction types as one set in both languages', () => {
    expect([catalogs.en['tx.type.bought'], catalogs.en['tx.type.sold'], catalogs.en['tx.type.deposit'], catalogs.en['tx.type.withdraw']]).toEqual([
      'Buy',
      'Sell',
      'Deposit',
      'Withdraw',
    ]);
    expect([catalogs['es-AR']['tx.type.bought'], catalogs['es-AR']['tx.type.sold'], catalogs['es-AR']['tx.type.deposit'], catalogs['es-AR']['tx.type.withdraw']]).toEqual([
      'Compra',
      'Venta',
      'Depósito',
      'Retiro',
    ]);
  });
});
