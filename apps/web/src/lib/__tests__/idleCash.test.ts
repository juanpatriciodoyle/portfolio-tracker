import { describe, it, expect } from 'vitest';
import { IDLE_CASH_MIN_AMOUNT, IDLE_CASH_SHARE_LIMIT, idleCashNote } from '../idleCash';

const base = { cash: 24500, total: 490000, inflationRatePercent: 2.9, hasForeignCash: false };

describe('idleCashNote', () => {
  it('has named limits: over 10% of the total and over 1,000', () => {
    expect(IDLE_CASH_SHARE_LIMIT).toBe(10);
    expect(IDLE_CASH_MIN_AMOUNT).toBe(1000);
  });

  it('says what the idle cash loses to inflation in a year', () => {
    expect(idleCashNote({ cash: 24500, total: 200000, inflationRatePercent: 2.9, hasForeignCash: false })).toEqual({
      cash: 24500,
      sharePercent: 12,
      annualLoss: 710,
      inflationRatePercent: 2.9,
      hasForeignCash: false,
    });
  });

  it('rounds the loss to a nearby figure, since it is only "about": tens from 100 up, whole units below', () => {
    expect(idleCashNote({ cash: 1500, total: 5000, inflationRatePercent: 2.9, hasForeignCash: false })?.annualLoss).toBe(44);
    expect(idleCashNote({ cash: 1100, total: 5000, inflationRatePercent: 5, hasForeignCash: false })?.annualLoss).toBe(55);
    expect(idleCashNote({ cash: 5000, total: 20000, inflationRatePercent: 2.9, hasForeignCash: false })?.annualLoss).toBe(150);
    expect(idleCashNote({ cash: 1001, total: 5000, inflationRatePercent: 1, hasForeignCash: false })?.annualLoss).toBe(10);
    expect(idleCashNote({ cash: 3000, total: 9000, inflationRatePercent: 0.1, hasForeignCash: false })?.annualLoss).toBe(3);
  });

  it('rounds the share to a whole percent', () => {
    expect(idleCashNote({ cash: 24500, total: 200000, inflationRatePercent: 2.9, hasForeignCash: false })?.sharePercent).toBe(12);
  });

  it('says nothing when cash is 10% of the total or less', () => {
    expect(idleCashNote({ cash: 10000, total: 100000, inflationRatePercent: 2.9, hasForeignCash: false })).toBeNull();
    expect(idleCashNote({ cash: 5000, total: 100000, inflationRatePercent: 2.9, hasForeignCash: false })).toBeNull();
  });

  it('says nothing when cash is 1,000 or less, however big its share', () => {
    expect(idleCashNote({ cash: 1000, total: 2000, inflationRatePercent: 2.9, hasForeignCash: false })).toBeNull();
    expect(idleCashNote({ cash: 900, total: 1000, inflationRatePercent: 2.9, hasForeignCash: false })).toBeNull();
  });

  it('says nothing without a usable inflation rate', () => {
    expect(idleCashNote({ ...base, total: 100000, inflationRatePercent: undefined })).toBeNull();
    expect(idleCashNote({ ...base, total: 100000, inflationRatePercent: 0 })).toBeNull();
    expect(idleCashNote({ ...base, total: 100000, inflationRatePercent: Number.NaN })).toBeNull();
  });

  it('says nothing for an empty or negative total or cash', () => {
    expect(idleCashNote({ ...base, total: 0 })).toBeNull();
    expect(idleCashNote({ ...base, cash: -2000, total: 5000 })).toBeNull();
  });

  it('carries the currency moves flag for cash held in other currencies', () => {
    expect(idleCashNote({ ...base, total: 100000, hasForeignCash: true })?.hasForeignCash).toBe(true);
  });
});
