import { ConcurrencyGate, SlidingWindowRateLimiter } from '../application/limits';

describe('SlidingWindowRateLimiter', () => {
  const build = (limit = 3, windowMs = 60_000) => {
    let now = 1_000_000;
    return { limiter: new SlidingWindowRateLimiter({ limit, windowMs, now: () => now }), advance: (ms: number) => (now += ms) };
  };

  it('allows up to the limit, then says how long to wait', () => {
    const { limiter, advance } = build();

    for (let i = 0; i < 3; i++) expect(limiter.tryAcquire('user-1')).toEqual({ allowed: true });
    advance(20_000);

    expect(limiter.tryAcquire('user-1')).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it('frees a slot as the window moves on', () => {
    const { limiter, advance } = build();
    for (let i = 0; i < 3; i++) limiter.tryAcquire('user-1');

    advance(60_001);

    expect(limiter.tryAcquire('user-1')).toEqual({ allowed: true });
  });

  it('counts each person separately', () => {
    const { limiter } = build(1);
    limiter.tryAcquire('user-1');

    expect(limiter.tryAcquire('user-2')).toEqual({ allowed: true });
    expect(limiter.tryAcquire('user-1').allowed).toBe(false);
  });

  it('does not count refused attempts against the person', () => {
    const { limiter, advance } = build(1);
    limiter.tryAcquire('user-1');
    for (let i = 0; i < 50; i++) limiter.tryAcquire('user-1');

    advance(60_001);

    expect(limiter.tryAcquire('user-1')).toEqual({ allowed: true });
  });

  it('forgets people who stopped asking, so memory does not grow without bound', () => {
    const { limiter, advance } = build();
    limiter.tryAcquire('user-1');
    advance(120_000);
    limiter.tryAcquire('user-2');

    expect(limiter.trackedKeys()).toBe(1);
  });
});

describe('ConcurrencyGate', () => {
  it('lets only so many through at once and frees a place when one leaves', () => {
    const gate = new ConcurrencyGate(2);

    const first = gate.tryEnter();
    const second = gate.tryEnter();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(gate.tryEnter()).toBeNull();
    first?.();
    expect(gate.tryEnter()).not.toBeNull();
  });

  it('ignores a place being released twice', () => {
    const gate = new ConcurrencyGate(1);
    const leave = gate.tryEnter();

    leave?.();
    leave?.();

    expect(gate.tryEnter()).not.toBeNull();
    expect(gate.tryEnter()).toBeNull();
  });
});
