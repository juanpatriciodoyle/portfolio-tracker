export interface SellablePosition {
  symbol: string;
  name: string;
  quantity: number;
  assetClass: string;
  sector: string;
  region: string;
}

export type SaleQuantityCheck = { ok: true; quantity: number } | { ok: false; message: string };

const DUST = 1e-8;
const MAX_DECIMALS = 8;

/** Units as a person reads them: no trailing zeros, at most eight decimals. */
export function formatUnits(units: number): string {
  return String(Number(units.toFixed(MAX_DECIMALS)));
}

/** A sale is a number above zero that does not exceed what is held. */
export function checkSaleQuantity(text: string, available: number): SaleQuantityCheck {
  const quantity = Number(text);
  if (text.trim() === '' || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: 'Enter how many units you sold.' };
  }
  if (quantity > available + DUST) {
    return { ok: false, message: `You only hold ${formatUnits(available)} ${available === 1 ? 'unit' : 'units'}.` };
  }
  return { ok: true, quantity: Math.min(quantity, available) };
}

/** The holdings that can be sold and match what the person typed: by ticker or name. */
export function findSellable(positions: readonly SellablePosition[], query: string): SellablePosition[] {
  const needle = query.trim().toLowerCase();
  return positions.filter((p) => p.quantity > 0 && (needle === '' || p.symbol.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)));
}
