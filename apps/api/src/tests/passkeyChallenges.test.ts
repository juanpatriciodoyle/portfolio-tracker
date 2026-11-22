import { PasskeyChallenges, PASSKEY_CHALLENGE_TTL_MS } from '../infrastructure/passkeyChallenges';

function build() {
  let now = 1_000_000;
  const challenges = new PasskeyChallenges(() => now);
  return { challenges, advance: (ms: number) => void (now += ms) };
}

describe('PasskeyChallenges', () => {
  it('answers the challenge that was remembered for a key', () => {
    const { challenges } = build();
    challenges.remember('hash-a', 'challenge-a');
    expect(challenges.consume('hash-a')).toBe('challenge-a');
  });

  it('answers nothing for a key it never saw', () => {
    expect(build().challenges.consume('nobody')).toBeUndefined();
  });

  it('can be used once: a second attempt against the same challenge finds nothing', () => {
    const { challenges } = build();
    challenges.remember('hash-a', 'challenge-a');

    expect(challenges.consume('hash-a')).toBe('challenge-a');
    expect(challenges.consume('hash-a')).toBeUndefined();
  });

  it('keeps each key apart', () => {
    const { challenges } = build();
    challenges.remember('hash-a', 'challenge-a');
    challenges.remember('hash-b', 'challenge-b');

    expect(challenges.consume('hash-b')).toBe('challenge-b');
    expect(challenges.consume('hash-a')).toBe('challenge-a');
  });

  it('forgets a challenge after five minutes', () => {
    expect(PASSKEY_CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    const { challenges, advance } = build();
    challenges.remember('hash-a', 'challenge-a');

    advance(PASSKEY_CHALLENGE_TTL_MS);

    expect(challenges.consume('hash-a')).toBeUndefined();
  });

  it('still answers just before it expires', () => {
    const { challenges, advance } = build();
    challenges.remember('hash-a', 'challenge-a');

    advance(PASSKEY_CHALLENGE_TTL_MS - 1);

    expect(challenges.consume('hash-a')).toBe('challenge-a');
  });

  it('a newer challenge for the same key replaces the older one', () => {
    const { challenges } = build();
    challenges.remember('hash-a', 'first');
    challenges.remember('hash-a', 'second');
    expect(challenges.consume('hash-a')).toBe('second');
  });

  it('does not keep expired challenges forever', () => {
    const { challenges, advance } = build();
    challenges.remember('abandoned', 'x');
    advance(PASSKEY_CHALLENGE_TTL_MS + 1);

    challenges.remember('fresh', 'y');

    expect(challenges.size()).toBe(1);
  });
});
