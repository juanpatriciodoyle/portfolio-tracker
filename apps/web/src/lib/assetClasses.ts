/**
 * The one list of asset classes, for every screen that names or filters them. Older holdings were saved with other
 * words ("Equity", "Fixed Income", "Cryptocurrency"): they are read as the class on this list, never shown as a class of their own.
 */
export const ASSET_CLASSES = ['Stock', 'ETF', 'Crypto', 'Bond', 'Real Estate'] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

const OLDER_WORDS: Readonly<Record<string, AssetClass>> = {
  equity: 'Stock',
  cryptocurrency: 'Crypto',
  'fixed income': 'Bond',
};

/** The class on the list for a stored word. Cash and a word nobody has taught us stay as they came; an empty class is a stock, as it always was. */
export function normalizeAssetClass(stored: string): string {
  const word = stored.trim();
  if (word === '') return 'Stock';
  const listed = ASSET_CLASSES.find((assetClass) => assetClass.toLowerCase() === word.toLowerCase());
  return listed ?? OLDER_WORDS[word.toLowerCase()] ?? word;
}

export const isCrypto = (assetClass: string): boolean => normalizeAssetClass(assetClass) === 'Crypto';

const CRYPTO_AS_SECTOR = new Set(['crypto', 'cryptocurrency']);

/** Crypto is a class of asset, not an industry: a holding saved with it as its sector has no sector. */
export const sectorOf = (sector: string): string => (CRYPTO_AS_SECTOR.has(sector.trim().toLowerCase()) ? '' : sector);
