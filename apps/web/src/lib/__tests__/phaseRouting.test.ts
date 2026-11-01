import { describe, expect, it } from 'vitest';
import { defaultExpensePhase, phaseCoveringDay } from '../phaseRouting';

const madrid = { id: 'madrid', startDate: '2022-09-01', endDate: '2024-08-31' };
const lisbon = { id: 'lisbon', startDate: '2024-09-01', endDate: null };

describe('phaseCoveringDay', () => {
  it('finds the phase a day falls in, on both of its edges', () => {
    expect(phaseCoveringDay([madrid, lisbon], '2022-09-01')).toBe(madrid);
    expect(phaseCoveringDay([madrid, lisbon], '2024-08-31')).toBe(madrid);
    expect(phaseCoveringDay([madrid, lisbon], '2024-09-01')).toBe(lisbon);
  });

  it('treats a phase with no end as still going', () => {
    expect(phaseCoveringDay([lisbon], '2031-01-01')).toBe(lisbon);
  });

  it('is null before the first phase, in a gap and with no phases', () => {
    expect(phaseCoveringDay([madrid, lisbon], '2022-08-31')).toBeNull();
    expect(phaseCoveringDay([madrid, { ...lisbon, startDate: '2025-01-01' }], '2024-10-01')).toBeNull();
    expect(phaseCoveringDay([], '2024-10-01')).toBeNull();
  });
});

describe('defaultExpensePhase', () => {
  it('is the home lived in today', () => {
    expect(defaultExpensePhase([madrid, lisbon], '2026-10-31')).toBe(lisbon);
  });

  it('is the home lived in last when none covers today', () => {
    expect(defaultExpensePhase([madrid], '2026-10-31')).toBe(madrid);
  });

  it('is null with no phases', () => {
    expect(defaultExpensePhase([], '2026-10-31')).toBeNull();
  });
});
