import { describe, it, expect } from 'vitest';
import { ASSET_CLASSES, isCrypto, normalizeAssetClass, sectorOf } from '../assetClasses';

describe('asset classes', () => {
  it('has one list of five classes', () => {
    expect([...ASSET_CLASSES]).toEqual(['Stock', 'ETF', 'Crypto', 'Bond', 'Real Estate']);
  });

  it('keeps a class that is already on the list', () => {
    for (const assetClass of ASSET_CLASSES) expect(normalizeAssetClass(assetClass)).toBe(assetClass);
  });

  it.each([
    ['Equity', 'Stock'],
    ['Cryptocurrency', 'Crypto'],
    ['Fixed Income', 'Bond'],
    ['equity', 'Stock'],
    ['  crypto ', 'Crypto'],
  ])('reads the older word %s as %s', (older, expected) => {
    expect(normalizeAssetClass(older)).toBe(expected);
  });

  it('keeps Cash as its own word and a word it does not know as it came', () => {
    expect(normalizeAssetClass('Cash')).toBe('Cash');
    expect(normalizeAssetClass('Commodities')).toBe('Commodities');
  });

  it('treats an empty class as a stock, as the holdings always did', () => {
    expect(normalizeAssetClass('')).toBe('Stock');
  });

  it('knows crypto by any of its words', () => {
    expect(isCrypto('Crypto')).toBe(true);
    expect(isCrypto('Cryptocurrency')).toBe(true);
    expect(isCrypto('Stock')).toBe(false);
  });

  it('never lets Crypto be a sector: that is an asset class', () => {
    expect(sectorOf('Crypto')).toBe('');
    expect(sectorOf('Cryptocurrency')).toBe('');
    expect(sectorOf('Technology')).toBe('Technology');
    expect(sectorOf('')).toBe('');
  });
});
