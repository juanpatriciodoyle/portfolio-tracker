export interface PositionCost {
  readonly quantity: number;
  readonly investedAmount: number;
}

export interface PositionValue {
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  /** False when no market price was known: the value is then the cost, and the gain is not a measurement. */
  readonly priced: boolean;
}

/** The share of an open position's cost that a sale of `soldQuantity` units takes with it. */
export function costBasisOfSale(position: PositionCost, soldQuantity: number): number {
  if (position.quantity <= 0 || soldQuantity <= 0) return 0;
  return position.investedAmount * Math.min(1, soldQuantity / position.quantity);
}

/** What an open position is worth at `price` per unit; `null` (or a price that is not a positive number) means unknown. */
export function valueOpenPosition(position: PositionCost, price: number | null): PositionValue {
  if (price === null || !Number.isFinite(price) || price <= 0) {
    return { marketValue: position.investedAmount, unrealizedPnl: 0, priced: false };
  }
  const marketValue = position.quantity * price;
  return { marketValue, unrealizedPnl: marketValue - position.investedAmount, priced: true };
}
