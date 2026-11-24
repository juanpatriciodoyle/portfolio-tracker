/** The demo guest's name and the address shown for it. Display only: no guest account is ever found, or stored, by it. */
export const GUEST_DISPLAY_NAME = 'Joe';
export const GUEST_DISPLAY_EMAIL = 'demo@portfolio.local';

/** A demo session lasts an hour at most: the token stops working and the account is erased. */
export const GUEST_SESSION_MS = 60 * 60 * 1000;

/** How many demo accounts may exist at once. Each one is real data until it is erased, so the demo cannot be used to fill the database. */
export const MAX_LIVE_GUESTS = 50;

/** When a guest session that began at `startedAt` ends. */
export const guestSessionEnd = (startedAt: Date): Date => new Date(startedAt.getTime() + GUEST_SESSION_MS);

/** An account that expires exactly at `now` has expired. */
export const hasExpired = (expiresAt: Date, now: Date): boolean => expiresAt.getTime() <= now.getTime();
