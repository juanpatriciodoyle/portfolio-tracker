import { incomeStreamSchema } from '../contracts';

const base = { label: 'Salary', amountMinor: 300000, startDate: '2026-01-01', endDate: null };

describe('incomeStreamSchema: lifecycle fields', () => {
  it('reads an older stream exactly as before: no new keys appear', () => {
    expect(incomeStreamSchema.parse(base)).toEqual(base);
  });

  it('accepts why a job ended', () => {
    expect(incomeStreamSchema.parse({ ...base, endDate: '2026-03-31', endReason: 'LAID_OFF' }).endReason).toBe('LAID_OFF');
  });

  it('refuses an unknown reason', () => {
    expect(incomeStreamSchema.safeParse({ ...base, endDate: '2026-03-31', endReason: 'FIRED_BY_ROBOT' }).success).toBe(false);
  });

  it('refuses a reason on a job that has not ended', () => {
    expect(incomeStreamSchema.safeParse({ ...base, endReason: 'QUIT' }).success).toBe(false);
  });

  it('accepts a one-time deposit on a single day', () => {
    expect(incomeStreamSchema.safeParse({ ...base, kind: 'ONE_TIME' }).success).toBe(true);
  });

  it('refuses a one-time deposit that spans days or has an end reason', () => {
    expect(incomeStreamSchema.safeParse({ ...base, kind: 'ONE_TIME', endDate: '2026-02-01' }).success).toBe(false);
    expect(incomeStreamSchema.safeParse({ ...base, kind: 'ONE_TIME', endReason: 'QUIT' }).success).toBe(false);
  });
});
