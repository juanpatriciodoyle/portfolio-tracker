import { phaseForBill } from '../domain/phaseForBill';

const phases = [
  { id: 'madrid', startDate: '2022-09-01', endDate: '2024-08-31' },
  { id: 'buenos-aires', startDate: '2024-09-01', endDate: null },
];

describe('phaseForBill: which living phase a bill probably belongs to', () => {
  it('picks the phase that covers the start of the bill’s period', () => {
    expect(phaseForBill(phases, '2023-05-10', '2026-10-31')).toBe('madrid');
    expect(phaseForBill(phases, '2025-01-01', '2026-10-31')).toBe('buenos-aires');
  });

  it('includes both ends of a phase', () => {
    expect(phaseForBill(phases, '2022-09-01', '2026-10-31')).toBe('madrid');
    expect(phaseForBill(phases, '2024-08-31', '2026-10-31')).toBe('madrid');
    expect(phaseForBill(phases, '2024-09-01', '2026-10-31')).toBe('buenos-aires');
  });

  it('falls back to the phase that is current today when the bill has no period', () => {
    expect(phaseForBill(phases, null, '2026-10-31')).toBe('buenos-aires');
    expect(phaseForBill(phases, null, '2023-01-01')).toBe('madrid');
  });

  it('answers nothing when the period is before every phase, or no phase is current', () => {
    expect(phaseForBill(phases, '2019-01-01', '2026-10-31')).toBeNull();
    expect(phaseForBill([{ id: 'old', startDate: '2020-01-01', endDate: '2021-01-01' }], null, '2026-10-31')).toBeNull();
    expect(phaseForBill([], '2025-01-01', '2026-10-31')).toBeNull();
  });
});
