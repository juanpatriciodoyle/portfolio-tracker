import { GUEST_SESSION_MS, guestSessionEnd, hasExpired } from '../domain/guestAccount';

const START = new Date('2026-11-23T10:00:00.000Z');

describe('a demo guest session', () => {
  it('lasts exactly one hour', () => {
    expect(GUEST_SESSION_MS).toBe(3_600_000);
    expect(guestSessionEnd(START)).toEqual(new Date('2026-11-23T11:00:00.000Z'));
  });

  it('is not expired before its end, and is expired at its end and after', () => {
    const end = guestSessionEnd(START);
    expect(hasExpired(end, new Date('2026-11-23T10:59:59.999Z'))).toBe(false);
    expect(hasExpired(end, end)).toBe(true);
    expect(hasExpired(end, new Date('2026-11-23T11:00:00.001Z'))).toBe(true);
  });
});
