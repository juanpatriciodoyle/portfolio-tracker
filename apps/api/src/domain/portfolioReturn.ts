import type { PositionValue } from './openPosition';

export interface ReturnSummary {
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly dividends: number;
  readonly buyFees: number;
  /** Profit from sold assets + gain on what is still held + dividends - what buying cost. */
  readonly totalReturn: number;
  readonly totalReturnPercent: number;
  readonly openValue: number;
  readonly allPriced: boolean;
}

/** The one place where "total return" is defined, so no screen adds the parts up differently. */
export function summarizeReturn(input: {
  readonly realizedPnl: number;
  readonly dividends: number;
  /** Fees paid when buying: sales already net their own fees. */
  readonly buyFees: number;
  /** Money put in minus money taken out: what the percentage is measured against. */
  readonly contributed: number;
  readonly openPositions: readonly PositionValue[];
}): ReturnSummary {
  const unrealizedPnl = input.openPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const totalReturn = input.realizedPnl + unrealizedPnl + input.dividends - input.buyFees;
  return {
    realizedPnl: input.realizedPnl,
    unrealizedPnl,
    dividends: input.dividends,
    buyFees: input.buyFees,
    totalReturn,
    totalReturnPercent: input.contributed > 0 ? (totalReturn / input.contributed) * 100 : 0,
    openValue: input.openPositions.reduce((sum, position) => sum + position.marketValue, 0),
    allPriced: input.openPositions.every((position) => position.priced),
  };
}
