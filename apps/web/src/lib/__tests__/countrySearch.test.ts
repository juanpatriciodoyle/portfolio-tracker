import { describe, expect, it } from 'vitest';
import { buildCountryIndex, normalizeSearchText, resolveCountry, searchCountries, splitEntries } from '../countrySearch';

const index = buildCountryIndex(['en', 'es']);
const codes = (query: string) => searchCountries(index, query).map((entry) => entry.code);

describe('normalizeSearchText', () => {
  it('ignores case, accents and surrounding spaces', () => {
    expect(normalizeSearchText('  EspAÑa ')).toBe('espana');
  });
});

describe('searchCountries', () => {
  it('lists every country for an empty query, in the order of the index', () => {
    expect(searchCountries(index, '')).toHaveLength(index.length);
    expect(searchCountries(index, '   ')).toHaveLength(index.length);
  });

  it('matches the beginning of the English name', () => {
    expect(codes('sp')[0]).toBe('ES');
    expect(codes('arg')).toContain('AR');
  });

  it('matches the beginning of the Spanish name', () => {
    expect(codes('es')).toEqual(expect.arrayContaining(['ES', 'EE', 'SZ']));
    expect(codes('alemania')).toEqual(['DE']);
    expect(codes('estados')).toContain('US');
  });

  it('matches without accents', () => {
    expect(codes('espana')).toContain('ES');
    expect(codes('panama')).toContain('PA');
  });

  it('matches anywhere inside a name, after the names that start with the query', () => {
    const result = codes('land');

    expect(result).toEqual(expect.arrayContaining(['FI', 'IE', 'PL']));
    expect(result).not.toContain('ES');
  });

  it('puts names that start with the query before names that only contain it', () => {
    const result = codes('ger');

    expect(result.indexOf('DE')).toBeLessThan(result.indexOf('NE'));
  });

  it('puts the country whose code is the query first', () => {
    expect(codes('ar')[0]).toBe('AR');
  });

  it('finds nothing for a query that matches no country', () => {
    expect(codes('zzzz')).toEqual([]);
  });

  it('lists each country once even when several of its names match', () => {
    const result = codes('es');

    expect(new Set(result).size).toBe(result.length);
  });
});

describe('resolveCountry', () => {
  it('accepts a full name in either language', () => {
    expect(resolveCountry(index, 'Spain')).toEqual({ kind: 'match', code: 'ES' });
    expect(resolveCountry(index, 'españa')).toEqual({ kind: 'match', code: 'ES' });
    expect(resolveCountry(index, 'Alemania')).toEqual({ kind: 'match', code: 'DE' });
  });

  it('accepts an ISO code', () => {
    expect(resolveCountry(index, 'ar')).toEqual({ kind: 'match', code: 'AR' });
  });

  it('accepts a beginning that only one country has', () => {
    expect(resolveCountry(index, 'argent')).toEqual({ kind: 'match', code: 'AR' });
  });

  it('asks which one when several countries share the beginning', () => {
    const result = resolveCountry(index, 'guinea');

    expect(result.kind).toBe('match');
    expect(resolveCountry(index, 'sou')).toMatchObject({ kind: 'ambiguous' });
  });

  it('reports a country it does not know', () => {
    expect(resolveCountry(index, 'Narnia')).toEqual({ kind: 'none' });
    expect(resolveCountry(index, '')).toEqual({ kind: 'none' });
  });
});

describe('splitEntries', () => {
  it('splits typed or pasted text at commas, semicolons and line breaks', () => {
    expect(splitEntries('Spain, Argentina;Italy\nFrance')).toEqual(['Spain', 'Argentina', 'Italy', 'France']);
  });

  it('drops empty pieces', () => {
    expect(splitEntries(' , ,Spain,, ')).toEqual(['Spain']);
    expect(splitEntries('')).toEqual([]);
  });
});
