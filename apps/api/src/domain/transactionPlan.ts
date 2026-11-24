import { costBasisOfSale } from './openPosition';

/** A transaction the person asked to record, fully parsed. */
export interface TransactionCommand {
  readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  /** Upper-case. */
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly amount: number;
  readonly fee: number;
  readonly currency: string;
  readonly notes?: string;
  readonly date: Date;
  /** A buy that draws on the cash the person holds instead of bringing new money. Ignored by every other type. */
  readonly paidWithCash: boolean;
}

/** What the person holds of one instrument before this transaction. */
export interface HeldPosition {
  readonly id: string;
  readonly quantity: number;
  readonly investedAmount: number;
}

export interface NewPosition {
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly investedAmount: number;
  readonly createdAt: Date;
}

export type PositionChange =
  | { readonly kind: 'open'; readonly data: NewPosition }
  | { readonly kind: 'grow'; readonly id: string; readonly quantity: number; readonly investedAmount: number }
  | { readonly kind: 'shrink'; readonly id: string; readonly quantity: number; readonly investedAmount: number }
  | { readonly kind: 'close'; readonly id: string };

export interface NewRealizedGain {
  readonly symbol: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly investedAmount: number;
  readonly returnedAmount: number;
  readonly realizedPnl: number;
  readonly realizedPnlPercent: number;
  readonly date: Date;
  /** The day the holding that was sold had been opened. Left out, the database stamps the day it was recorded. */
  readonly createdAt?: Date;
}

export interface TransactionPlan {
  readonly transaction: TransactionCommand & { readonly totalAmount: number };
  readonly position: PositionChange | null;
  readonly realizedGain: NewRealizedGain | null;
}

/** What a transaction moves in all: a buy pays its fee on top, every other kind has it taken off. */
export const totalAmountOf = (type: TransactionCommand['type'], amount: number, fee: number): number => amount + (type === 'BOUGHT' ? fee : -fee);

/** A position this small is dust left by float arithmetic, not something held. */
const DUST_COST = 0.01;
const DUST_UNITS = 0.0001;

/**
 * Everything one transaction changes, decided without touching anything: the row to keep, how the position moves,
 * and the profit a sale locks in. Cash is not here: it is replayed from the ledger (`cashLedger.ts`), never stored.
 */
export function planTransaction(command: TransactionCommand, held: HeldPosition | null): TransactionPlan {
  const transaction = { ...command, totalAmount: totalAmountOf(command.type, command.amount, command.fee) };

  if (command.type === 'BOUGHT') {
    const position: PositionChange = held
      ? { kind: 'grow', id: held.id, quantity: held.quantity + command.quantity, investedAmount: held.investedAmount + command.amount }
      : {
          kind: 'open',
          data: {
            symbol: command.symbol,
            name: command.name,
            assetClass: command.assetClass,
            region: command.region,
            sector: command.sector,
            quantity: command.quantity,
            investedAmount: command.amount,
            createdAt: command.date,
          },
        };
    return { transaction, position, realizedGain: null };
  }

  if (command.type === 'SOLD') {
    const netProceeds = command.amount - command.fee;
    // Only the units sold take their share of the cost with them.
    const costBasis = held ? costBasisOfSale(held, command.quantity) : 0;
    const realizedPnl = netProceeds - costBasis;
    const realizedGain: NewRealizedGain = {
      symbol: command.symbol,
      assetClass: command.assetClass,
      region: command.region,
      sector: command.sector,
      investedAmount: costBasis,
      returnedAmount: command.amount,
      realizedPnl,
      realizedPnlPercent: costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0,
      date: command.date,
    };

    if (!held) return { transaction, position: null, realizedGain };

    const remainingCost = held.investedAmount - costBasis;
    const remainingUnits = Math.max(0, held.quantity - command.quantity);
    const position: PositionChange =
      remainingCost <= DUST_COST || remainingUnits <= DUST_UNITS
        ? { kind: 'close', id: held.id }
        : { kind: 'shrink', id: held.id, quantity: remainingUnits, investedAmount: remainingCost };
    return { transaction, position, realizedGain };
  }

  return { transaction, position: null, realizedGain: null };
}
