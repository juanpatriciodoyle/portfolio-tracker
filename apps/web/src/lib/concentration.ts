import { isCrypto, normalizeAssetClass, sectorOf } from './assetClasses';

/** A sector is named when it is over this share of what the person owns (percent). */
export const SECTOR_SHARE_LIMIT = 40;
/** One company is named when it is over this share (percent). Funds never count as a company. */
export const COMPANY_SHARE_LIMIT = 25;
/** How many of the biggest holdings are added up... */
export const TOP_HOLDINGS_COUNT = 3;
/** ...and said aloud when together they are over this share (percent). */
export const TOP_HOLDINGS_SHARE_LIMIT = 50;
/** Crypto gets one factual line when it is over this share (percent). */
export const CRYPTO_SHARE_LIMIT = 10;
/** With fewer holdings than this there is nothing to compare, so nothing is said. */
export const MIN_HOLDINGS_FOR_FINDINGS = 2;

/** Sectors that mean "many industries at once": a fund in one is spread out by design, so it is never a concentration. */
const DIVERSIFIED_SECTORS = new Set(['Diversified', 'General Market', 'Global']);

export interface ConcentrationHolding {
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
  /** What the holding is worth today, in the person's currency. */
  value: number;
}

export type ConcentrationFinding =
  | { kind: 'company'; name: string; percent: number }
  | { kind: 'sector'; sector: string; percent: number }
  | { kind: 'crypto'; percent: number }
  | { kind: 'topHoldings'; count: number; percent: number };

export interface SectorShare {
  /** A sector, the cash, or what is left over: no sector, or the smaller sectors folded together. */
  kind: 'sector' | 'cash' | 'other';
  /** The sector as stored; empty unless `kind` is "sector". */
  sector: string;
  percent: number;
}

const isFund = (holding: ConcentrationHolding): boolean => normalizeAssetClass(holding.assetClass) === 'ETF' || DIVERSIFIED_SECTORS.has(holding.sector);

const percentOf = (part: number, whole: number): number => (part / whole) * 100;

const valued = (holdings: readonly ConcentrationHolding[]): ConcentrationHolding[] => holdings.filter((holding) => holding.value > 0);

const heldValue = (holdings: readonly ConcentrationHolding[]): number => holdings.reduce((sum, holding) => sum + holding.value, 0);

/**
 * What is worth knowing about how what the person owns is spread, most telling first: one company, one sector,
 * crypto, then the few biggest holdings together. Facts only: judging them is left to the reader.
 * "What the person owns" is everything the home screen counts, cash included, so a share here is the share the table shows.
 */
export function concentrationFindings(all: readonly ConcentrationHolding[], cash = 0): ConcentrationFinding[] {
  const holdings = valued(all);
  if (holdings.length < MIN_HOLDINGS_FOR_FINDINGS) return [];
  const total = heldValue(holdings) + Math.max(0, cash);
  const findings: ConcentrationFinding[] = [];

  const companies = holdings.filter((holding) => !isFund(holding) && normalizeAssetClass(holding.assetClass) === 'Stock').sort((a, b) => b.value - a.value);
  const biggest = companies[0];
  if (biggest && percentOf(biggest.value, total) > COMPANY_SHARE_LIMIT) {
    findings.push({ kind: 'company', name: biggest.name || biggest.symbol, percent: Math.round(percentOf(biggest.value, total)) });
  }

  const bySector = new Map<string, number>();
  for (const holding of holdings) {
    const sector = sectorOf(holding.sector);
    if (sector === '' || DIVERSIFIED_SECTORS.has(sector)) continue;
    bySector.set(sector, (bySector.get(sector) ?? 0) + holding.value);
  }
  const [topSector, topSectorValue] = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (topSectorValue > 0 && percentOf(topSectorValue, total) > SECTOR_SHARE_LIMIT) {
    findings.push({ kind: 'sector', sector: topSector, percent: Math.round(percentOf(topSectorValue, total)) });
  }

  const cryptoValue = holdings.filter((holding) => isCrypto(holding.assetClass)).reduce((sum, holding) => sum + holding.value, 0);
  if (percentOf(cryptoValue, total) > CRYPTO_SHARE_LIMIT) findings.push({ kind: 'crypto', percent: Math.round(percentOf(cryptoValue, total)) });

  const topValue = holdings
    .filter((holding) => !isFund(holding))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_HOLDINGS_COUNT)
    .reduce((sum, holding) => sum + holding.value, 0);
  if (percentOf(topValue, total) > TOP_HOLDINGS_SHARE_LIMIT) {
    findings.push({ kind: 'topHoldings', count: TOP_HOLDINGS_COUNT, percent: Math.round(percentOf(topValue, total)) });
  }

  return findings;
}

/**
 * What is owned, split by sector, biggest first, with the cash as a part of its own. Beyond `segments` sectors, and
 * holdings with no sector, are folded into one "other".
 */
export function sectorShares(all: readonly ConcentrationHolding[], segments: number, cash = 0): SectorShare[] {
  const holdings = valued(all);
  const cashValue = Math.max(0, cash);
  const total = heldValue(holdings) + cashValue;
  if (total <= 0) return [];
  const bySector = new Map<string, number>();
  for (const holding of holdings) bySector.set(sectorOf(holding.sector), (bySector.get(sectorOf(holding.sector)) ?? 0) + holding.value);

  const named = [...bySector.entries()].filter(([sector]) => sector !== '').sort((a, b) => b[1] - a[1]);
  const kept = named.slice(0, segments);
  const otherValue = total - cashValue - kept.reduce((sum, [, value]) => sum + value, 0);
  const shares: SectorShare[] = kept.map(([sector, value]) => ({ kind: 'sector', sector, percent: percentOf(value, total) }));
  if (otherValue > 0) shares.push({ kind: 'other', sector: '', percent: percentOf(otherValue, total) });
  if (cashValue > 0) shares.push({ kind: 'cash', sector: '', percent: percentOf(cashValue, total) });
  return shares;
}
