export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface Pending {
  readonly challenge: string;
  readonly expiresAt: number;
}

/**
 * The challenges handed to the passkey prompt, waiting for its answer. Each one lives five minutes and can be
 * answered once, so a stolen or replayed answer finds nothing to be checked against. The clock is passed in.
 */
export class PasskeyChallenges {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly now: () => number,
    private readonly ttlMs: number = PASSKEY_CHALLENGE_TTL_MS
  ) {}

  remember(key: string, challenge: string): void {
    this.forgetExpired();
    this.pending.set(key, { challenge, expiresAt: this.now() + this.ttlMs });
  }

  /** The challenge for the key, if it is still alive. Asking removes it, answered or not. */
  consume(key: string): string | undefined {
    const entry = this.pending.get(key);
    this.pending.delete(key);
    return entry && entry.expiresAt > this.now() ? entry.challenge : undefined;
  }

  size(): number {
    return this.pending.size;
  }

  private forgetExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(key);
    }
  }
}
