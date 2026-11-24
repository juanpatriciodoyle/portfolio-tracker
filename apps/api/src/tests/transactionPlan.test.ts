import { planTransaction, type TransactionCommand } from '../domain/transactionPlan';

const DAY = new Date('2025-03-01T10:00:00Z');

const command = (extra: Partial<TransactionCommand>): TransactionCommand => ({
  type: 'BOUGHT',
  symbol: 'AAPL',
  name: 'Apple',
  assetClass: 'Stock',
  region: 'North America',
  sector: 'Technology',
  quantity: 10,
  amount: 1000,
  fee: 0,
  currency: 'EUR',
  paidWithCash: false,
  date: DAY,
  ...extra,
});

describe('planTransaction: what recording a transaction changes', () => {
  describe('a buy', () => {
    it('opens a position at its cost when none is held', () => {
      const plan = planTransaction(command({ fee: 2 }), null);
      expect(plan.position).toEqual({
        kind: 'open',
        data: { symbol: 'AAPL', name: 'Apple', assetClass: 'Stock', region: 'North America', sector: 'Technology', quantity: 10, investedAmount: 1000, createdAt: DAY },
      });
      expect(plan.realizedGain).toBeNull();
    });

    it('adds to the position that is held, without counting the fee in its cost', () => {
      const plan = planTransaction(command({ quantity: 5, amount: 600, fee: 3 }), { id: 'p1', quantity: 10, investedAmount: 1000 });
      expect(plan.position).toEqual({ kind: 'grow', id: 'p1', quantity: 15, investedAmount: 1600 });
    });

    it('stores the total as amount plus fee, and carries the paid-with-cash choice', () => {
      const plan = planTransaction(command({ amount: 1000, fee: 4, paidWithCash: true }), null);
      expect(plan.transaction).toMatchObject({ type: 'BOUGHT', symbol: 'AAPL', amount: 1000, fee: 4, totalAmount: 1004, paidWithCash: true, date: DAY });
    });
  });

  describe('a sale', () => {
    it('books the profit against its share of the cost and shrinks the position', () => {
      const plan = planTransaction(command({ type: 'SOLD', quantity: 5, amount: 700, fee: 5 }), { id: 'p1', quantity: 10, investedAmount: 1000 });
      expect(plan.realizedGain).toEqual({
        symbol: 'AAPL',
        assetClass: 'Stock',
        region: 'North America',
        sector: 'Technology',
        investedAmount: 500,
        returnedAmount: 700,
        realizedPnl: 195,
        realizedPnlPercent: 39,
        date: DAY,
      });
      expect(plan.position).toEqual({ kind: 'shrink', id: 'p1', quantity: 5, investedAmount: 500 });
      expect(plan.transaction.totalAmount).toBe(695);
    });

    it('closes the position when everything is sold', () => {
      const plan = planTransaction(command({ type: 'SOLD', quantity: 10, amount: 1200 }), { id: 'p1', quantity: 10, investedAmount: 1000 });
      expect(plan.position).toEqual({ kind: 'close', id: 'p1' });
      expect(plan.realizedGain?.realizedPnl).toBe(200);
    });

    it('reports a loss as a negative gain', () => {
      const plan = planTransaction(command({ type: 'SOLD', quantity: 10, amount: 800 }), { id: 'p1', quantity: 10, investedAmount: 1000 });
      expect(plan.realizedGain).toMatchObject({ realizedPnl: -200, realizedPnlPercent: -20 });
    });

    it('has no percentage when there was no cost to measure against', () => {
      const plan = planTransaction(command({ type: 'SOLD', quantity: 1, amount: 50 }), null);
      expect(plan.realizedGain).toMatchObject({ investedAmount: 0, realizedPnl: 50, realizedPnlPercent: 0 });
      expect(plan.position).toBeNull();
    });
  });

  describe('a deposit or withdrawal', () => {
    it('changes no position and books no gain', () => {
      for (const type of ['DEPOSIT', 'WITHDRAWAL'] as const) {
        const plan = planTransaction(command({ type, symbol: type, quantity: 1, amount: 300, fee: 0 }), null);
        expect(plan.position).toBeNull();
        expect(plan.realizedGain).toBeNull();
        expect(plan.transaction.totalAmount).toBe(300);
      }
    });

    it('keeps the notes (dividends are recognised by them)', () => {
      const plan = planTransaction(command({ type: 'DEPOSIT', symbol: 'DEPOSIT', notes: 'dividend' }), null);
      expect(plan.transaction.notes).toBe('dividend');
    });
  });
});
