import { describe, expect, it } from 'vitest';
import { translateEnglish as t, translatorFor } from '../../../i18n/translate';
import { describeCostAdded, monthlyAmountMinor } from '../costToast';

describe('monthlyAmountMinor', () => {
  it('turns what one payment costs into what it costs each month', () => {
    expect(monthlyAmountMinor(6200, 'MONTHLY')).toBe(6200);
    expect(monthlyAmountMinor(12000, 'BIMONTHLY')).toBe(6000);
    expect(monthlyAmountMinor(18000, 'QUARTERLY')).toBe(6000);
    expect(monthlyAmountMinor(36000, 'SEMI_ANNUALLY')).toBe(6000);
    expect(monthlyAmountMinor(72000, 'ANNUAL')).toBe(6000);
  });

  it('has no monthly amount for something paid once', () => {
    expect(monthlyAmountMinor(6200, 'ONE_OFF')).toBeNull();
  });
});

describe('describeCostAdded', () => {
  const base = { category: 'ELECTRICITY' as const, amountMinor: 6200, cadence: 'MONTHLY' as const, currency: 'EUR' };

  it('says what was added and how it moved what the person keeps', () => {
    expect(describeCostAdded({ ...base, keptBefore: 0.69, keptAfter: 0.67 }, 'en-GB', t)).toBe('Electricity €62/month added. You now keep 67% (was 69%).');
  });

  it('says what was added and nothing more when what is kept did not move, or is not known', () => {
    expect(describeCostAdded({ ...base, keptBefore: 0.691, keptAfter: 0.689 }, 'en-GB', t)).toBe('Electricity €62/month added.');
    expect(describeCostAdded({ ...base, keptBefore: null, keptAfter: 0.67 }, 'en-GB', t)).toBe('Electricity €62/month added.');
    expect(describeCostAdded({ ...base, keptBefore: 0.69, keptAfter: null }, 'en-GB', t)).toBe('Electricity €62/month added.');
  });

  it('works out a month from a bill that covers several', () => {
    expect(describeCostAdded({ ...base, amountMinor: 12400, cadence: 'BIMONTHLY', keptBefore: 0.69, keptAfter: 0.68 }, 'en-GB', t)).toBe('Electricity €62/month added. You now keep 68% (was 69%).');
  });

  it('does not call a one-time payment monthly, and still says what it did to the average', () => {
    expect(describeCostAdded({ ...base, cadence: 'ONE_OFF', keptBefore: 0.69, keptAfter: 0.67 }, 'en-GB', t)).toBe('Electricity €62 added. You now keep 67% (was 69%).');
  });

  it('says when what is kept went up, too', () => {
    expect(describeCostAdded({ ...base, amountMinor: 3000, category: 'INTERNET', keptBefore: 0.5, keptAfter: 0.52 }, 'en-GB', t)).toBe('Internet €30/month added. You now keep 52% (was 50%).');
  });

  it('speaks Argentine Spanish', () => {
    expect(describeCostAdded({ ...base, keptBefore: 0.69, keptAfter: 0.67 }, 'es-AR', translatorFor('es-AR'))).toMatch(/^Electricidad .*62.*\/mes agregad[ao]\. Ahora te queda el 67 ?% \(antes el 69 ?%\)\.$/);
  });
});
