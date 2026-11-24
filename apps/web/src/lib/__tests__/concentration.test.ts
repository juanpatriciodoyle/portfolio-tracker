import { describe, it, expect } from 'vitest';
import {
  COMPANY_SHARE_LIMIT,
  CRYPTO_SHARE_LIMIT,
  MIN_HOLDINGS_FOR_FINDINGS,
  SECTOR_SHARE_LIMIT,
  TOP_HOLDINGS_COUNT,
  TOP_HOLDINGS_SHARE_LIMIT,
  concentrationFindings,
  sectorShares,
  type ConcentrationHolding,
} from '../concentration';

const holding = (over: Partial<ConcentrationHolding> & { symbol: string; value: number }): ConcentrationHolding => ({
  name: over.symbol,
  assetClass: 'Stock',
  sector: 'Technology',
  ...over,
});

describe('concentration thresholds', () => {
  it('are named, in one place', () => {
    expect(SECTOR_SHARE_LIMIT).toBe(40);
    expect(COMPANY_SHARE_LIMIT).toBe(25);
    expect(TOP_HOLDINGS_COUNT).toBe(3);
    expect(TOP_HOLDINGS_SHARE_LIMIT).toBe(50);
    expect(CRYPTO_SHARE_LIMIT).toBe(10);
    expect(MIN_HOLDINGS_FOR_FINDINGS).toBe(2);
  });
});

describe('concentrationFindings', () => {
  it('says nothing for fewer than two holdings', () => {
    expect(concentrationFindings([])).toEqual([]);
    expect(concentrationFindings([holding({ symbol: 'AAPL', value: 1000 })])).toEqual([]);
  });

  it('says nothing when no limit is crossed', () => {
    const spread = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((symbol, i) =>
      holding({ symbol, value: 100, sector: ['Technology', 'Financials', 'Energy', 'Healthcare'][i % 4] })
    );
    expect(concentrationFindings(spread)).toEqual([]);
  });

  it('names a sector that is over 40% of what is owned', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', value: 300, sector: 'Technology' }),
      holding({ symbol: 'MSFT', value: 250, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 150, sector: 'Financials' }),
      holding({ symbol: 'XOM', value: 150, sector: 'Energy' }),
      holding({ symbol: 'JNJ', value: 150, sector: 'Healthcare' }),
    ]);
    expect(findings).toContainEqual({ kind: 'sector', sector: 'Technology', percent: 55 });
  });

  it('does not name a sector at exactly 40%', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', value: 400, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 200, sector: 'Financials' }),
      holding({ symbol: 'XOM', value: 200, sector: 'Energy' }),
      holding({ symbol: 'JNJ', value: 200, sector: 'Healthcare' }),
    ]);
    expect(findings.some((f) => f.kind === 'sector')).toBe(false);
  });

  it('never counts a diversified fund as a concentrated sector or company', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'VUAA', name: 'Vanguard S&P 500', assetClass: 'ETF', sector: 'Diversified', value: 900 }),
      holding({ symbol: 'IWDA', name: 'iShares World', assetClass: 'ETF', sector: 'General Market', value: 50 }),
      holding({ symbol: 'AAPL', value: 50, sector: 'Technology' }),
    ]);
    expect(findings.filter((f) => f.kind === 'sector' || f.kind === 'company')).toEqual([]);
  });

  it('names one company over 25%, but never a fund, even one not marked diversified', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', name: 'Apple Inc.', value: 300, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 350, sector: 'Financials' }),
      holding({ symbol: 'QQQ', name: 'Invesco QQQ', assetClass: 'ETF', sector: 'Technology', value: 350 }),
    ]);
    expect(findings).toContainEqual({ kind: 'company', name: 'JPM', percent: 35 });
    expect(findings.filter((f) => f.kind === 'company')).toHaveLength(1);
  });

  it('gives the share of the three biggest companies when it is over half', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'A', value: 24, sector: 'Technology' }),
      holding({ symbol: 'B', value: 20, sector: 'Financials' }),
      holding({ symbol: 'C', value: 12, sector: 'Energy' }),
      holding({ symbol: 'D', value: 11, sector: 'Healthcare' }),
      holding({ symbol: 'E', value: 11, sector: 'Utilities' }),
      holding({ symbol: 'F', value: 11, sector: 'Industrials' }),
      holding({ symbol: 'G', value: 11, sector: 'Consumer' }),
    ]);
    expect(findings).toContainEqual({ kind: 'topHoldings', count: 3, percent: 56 });
  });

  it('gives a factual line when crypto is over 10%', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', value: 400, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 400, sector: 'Financials' }),
      holding({ symbol: 'BTC', name: 'Bitcoin', assetClass: 'Cryptocurrency', sector: 'Crypto', value: 200 }),
    ]);
    expect(findings).toContainEqual({ kind: 'crypto', percent: 20 });
  });

  it('does not report crypto at 10% or less, and never as a sector', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', value: 450, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 450, sector: 'Financials' }),
      holding({ symbol: 'BTC', assetClass: 'Crypto', sector: 'Crypto', value: 100 }),
    ]);
    expect(findings.some((f) => f.kind === 'crypto')).toBe(false);
    expect(findings.some((f) => f.kind === 'sector' && f.sector === 'Crypto')).toBe(false);
  });

  it('lists the most telling finding first: a company, then a sector, crypto, then the biggest three', () => {
    const findings = concentrationFindings([
      holding({ symbol: 'AAPL', name: 'Apple', value: 500, sector: 'Technology' }),
      holding({ symbol: 'MSFT', name: 'Microsoft', value: 200, sector: 'Technology' }),
      holding({ symbol: 'BTC', assetClass: 'Crypto', sector: 'Crypto', value: 150 }),
      holding({ symbol: 'JPM', value: 150, sector: 'Financials' }),
    ]);
    expect(findings.map((f) => f.kind)).toEqual(['company', 'sector', 'crypto', 'topHoldings']);
  });

  it('counts cash as part of what is owned, so a share is the share the table shows', () => {
    const holdings = [
      holding({ symbol: 'AAPL', name: 'Apple', value: 500, sector: 'Technology' }),
      holding({ symbol: 'JPM', value: 300, sector: 'Financials' }),
    ];
    // Without cash Apple is 62.5% of 800; with 200 in cash it is 50% of 1000.
    expect(concentrationFindings(holdings)).toContainEqual({ kind: 'company', name: 'Apple', percent: 63 });
    expect(concentrationFindings(holdings, 200)).toContainEqual({ kind: 'company', name: 'Apple', percent: 50 });
  });

  it('can be diluted below a limit by cash, but cash alone never makes a finding', () => {
    const holdings = [holding({ symbol: 'A', value: 300, sector: 'Technology' }), holding({ symbol: 'B', value: 300, sector: 'Financials' })];
    expect(concentrationFindings(holdings, 10000)).toEqual([]);
    expect(concentrationFindings(holdings, -500)).toEqual(concentrationFindings(holdings, 0));
  });

  it('ignores a holding worth nothing', () => {
    expect(concentrationFindings([holding({ symbol: 'A', value: 0 }), holding({ symbol: 'B', value: 500 })])).toEqual([]);
  });
});

describe('sectorShares', () => {
  it('splits what is owned by sector, biggest first, with the rest folded into Other', () => {
    const shares = sectorShares(
      [
        holding({ symbol: 'A', value: 500, sector: 'Technology' }),
        holding({ symbol: 'B', value: 200, sector: 'Financials' }),
        holding({ symbol: 'C', value: 100, sector: 'Energy' }),
        holding({ symbol: 'D', value: 100, sector: 'Utilities' }),
        holding({ symbol: 'E', value: 50, sector: 'Consumer' }),
        holding({ symbol: 'F', value: 50, sector: '' }),
      ],
      3
    );
    expect(shares.map((s) => s.kind)).toEqual(['sector', 'sector', 'sector', 'other']);
    expect(shares.map((s) => s.sector)).toEqual(['Technology', 'Financials', 'Energy', '']);
    expect(shares.map((s) => s.percent)).toEqual([50, 20, 10, 20]);
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });

  it('is empty with nothing owned', () => {
    expect(sectorShares([], 4)).toEqual([]);
    expect(sectorShares([], 4, 0)).toEqual([]);
  });

  it('counts the cash as a part of what is owned, last, so every share matches the table and the hero', () => {
    const shares = sectorShares(
      [holding({ symbol: 'A', value: 600, sector: 'Technology' }), holding({ symbol: 'B', value: 200, sector: 'Financials' })],
      4,
      200
    );
    expect(shares.map((s) => s.kind)).toEqual(['sector', 'sector', 'cash']);
    expect(shares.map((s) => s.percent)).toEqual([60, 20, 20]);
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });

  it('shows only the cash for someone with nothing but cash', () => {
    expect(sectorShares([], 4, 500)).toEqual([{ kind: 'cash', sector: '', percent: 100 }]);
  });
});
