import { costBasisOfSale, valueOpenPosition } from '../domain/openPosition';

describe('costBasisOfSale', () => {
  it('takes the whole cost when everything is sold', () => {
    expect(costBasisOfSale({ quantity: 10, investedAmount: 1000 }, 10)).toBe(1000);
  });

  it('takes a proportional share of the cost on a partial sale', () => {
    expect(costBasisOfSale({ quantity: 10, investedAmount: 1000 }, 4)).toBe(400);
  });

  it('never takes more than the cost held', () => {
    expect(costBasisOfSale({ quantity: 10, investedAmount: 1000 }, 12)).toBe(1000);
  });

  it('is zero for an empty position or nothing sold', () => {
    expect(costBasisOfSale({ quantity: 0, investedAmount: 0 }, 1)).toBe(0);
    expect(costBasisOfSale({ quantity: 10, investedAmount: 1000 }, 0)).toBe(0);
  });
});

describe('valueOpenPosition', () => {
  it('values at the market price when one is known', () => {
    expect(valueOpenPosition({ quantity: 10, investedAmount: 1000 }, 120)).toEqual({ marketValue: 1200, unrealizedPnl: 200, priced: true });
  });

  it('shows a loss as a negative gain', () => {
    expect(valueOpenPosition({ quantity: 10, investedAmount: 1000 }, 80)).toEqual({ marketValue: 800, unrealizedPnl: -200, priced: true });
  });

  it('falls back to cost, with no gain, when no price is known', () => {
    expect(valueOpenPosition({ quantity: 10, investedAmount: 1000 }, null)).toEqual({ marketValue: 1000, unrealizedPnl: 0, priced: false });
  });

  it('treats a zero or invalid price as unknown', () => {
    expect(valueOpenPosition({ quantity: 10, investedAmount: 1000 }, 0).priced).toBe(false);
    expect(valueOpenPosition({ quantity: 10, investedAmount: 1000 }, Number.NaN).priced).toBe(false);
  });
});
