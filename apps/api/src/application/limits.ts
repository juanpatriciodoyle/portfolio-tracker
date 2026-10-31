export type RateDecision = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/** At most `limit` accepted attempts per key in any `windowMs`. The clock is passed in. Attempts that are refused do not count. */
export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ limit, windowMs, now }: { limit: number; windowMs: number; now: () => number }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  tryAcquire(key: string): RateDecision {
    const now = this.now();
    this.forgetExpired(now);

    const recent = this.attempts.get(key) ?? [];
    if (recent.length >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    this.attempts.set(key, [...recent, now]);
    return { allowed: true };
  }

  trackedKeys(): number {
    return this.attempts.size;
  }

  private forgetExpired(now: number): void {
    for (const [key, times] of this.attempts) {
      const live = times.filter((time) => time + this.windowMs > now);
      if (live.length === 0) this.attempts.delete(key);
      else if (live.length !== times.length) this.attempts.set(key, live);
    }
  }
}

/** Only so many things at once. `tryEnter` answers the function that gives the place back, or null when full. */
export class ConcurrencyGate {
  private inside = 0;

  constructor(private readonly max: number) {}

  tryEnter(): (() => void) | null {
    if (this.inside >= this.max) return null;
    this.inside += 1;
    let left = false;
    return () => {
      if (left) return;
      left = true;
      this.inside -= 1;
    };
  }
}
