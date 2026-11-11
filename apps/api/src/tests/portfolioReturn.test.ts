import { summarizeReturn } from '../domain/portfolioReturn';

describe('summarizeReturn', () => {
  it('is all zero for an empty portfolio', () => {
    expect(summarizeReturn({ realizedPnl: 0, dividends: 0, buyFees: 0, openPositions: [], contributed: 0 })).toEqual({
      realizedPnl: 0,
      unrealizedPnl: 0,
      dividends: 0,
      buyFees: 0,
      totalReturn: 0,
      totalReturnPercent: 0,
      openValue: 0,
      allPriced: true,
    });
  });

  it('adds sold profit, open gains and dividends once each', () => {
    const result = summarizeReturn({
      realizedPnl: 4900,
      dividends: 100,
      buyFees: 20,
      contributed: 50000,
      openPositions: [
        { marketValue: 1200, unrealizedPnl: 200, priced: true },
        { marketValue: 700, unrealizedPnl: -300, priced: true },
      ],
    });
    expect(result.unrealizedPnl).toBe(-100);
    expect(result.totalReturn).toBe(4900 - 100 + 100 - 20);
    expect(result.totalReturnPercent).toBeCloseTo((4880 / 50000) * 100, 6);
    expect(result.openValue).toBe(1900);
  });

  it('reports a loss when open losses outweigh sold profit', () => {
    const result = summarizeReturn({ realizedPnl: 100, dividends: 0, buyFees: 0, contributed: 1000, openPositions: [{ marketValue: 500, unrealizedPnl: -400, priced: true }] });
    expect(result.totalReturn).toBe(-300);
    expect(result.totalReturnPercent).toBe(-30);
  });

  it('gives a zero percent when nothing was contributed', () => {
    expect(summarizeReturn({ realizedPnl: 100, dividends: 0, buyFees: 0, contributed: 0, openPositions: [] }).totalReturnPercent).toBe(0);
  });

  it('subtracts what buying cost: fees are a loss no sale has booked', () => {
    const result = summarizeReturn({ realizedPnl: 0, dividends: 0, buyFees: 15, contributed: 1000, openPositions: [{ marketValue: 985, unrealizedPnl: 0, priced: true }] });
    expect(result.totalReturn).toBe(-15);
  });

  it('says when an open position had no price', () => {
    const result = summarizeReturn({ realizedPnl: 0, dividends: 0, buyFees: 0, contributed: 100, openPositions: [{ marketValue: 100, unrealizedPnl: 0, priced: false }] });
    expect(result.allPriced).toBe(false);
  });
});
