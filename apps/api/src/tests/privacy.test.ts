import { configureIdentityHashing, createIdentityHasher, hashUserIdentity } from '../lib/privacy';

describe('identity hashing without a salt', () => {
  it('refuses to hash until the server has been given one: there is no built-in salt', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../lib/privacy') as typeof import('../lib/privacy');
      expect(() => fresh.hashUserIdentity('user@example.com')).toThrow(/salt/);
    });
  });

  it('gives different hashes for different salts, and the same one for the same salt', () => {
    const a = createIdentityHasher('salt-a-for-the-test');
    const b = createIdentityHasher('salt-b-for-the-test');
    expect(a('user@example.com')).toEqual(createIdentityHasher('salt-a-for-the-test')('user@example.com'));
    expect(a('user@example.com')).not.toEqual(b('user@example.com'));
  });
});

describe('Zero-Knowledge Privacy & Security Hashing', () => {
  beforeAll(() => configureIdentityHashing('salt-for-the-test-run'));

  it('should generate a deterministic SHA-256 HMAC hash for a given user identity', () => {
    const email = 'user@example.com';
    const hash1 = hashUserIdentity(email);
    const hash2 = hashUserIdentity(email);

    expect(hash1).toBeDefined();
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(64); // SHA-256 output length in hex
    expect(hash1).toEqual(hash2);
  });

  it('should generate distinct hashes for different user emails', () => {
    const hashA = hashUserIdentity('alice@example.com');
    const hashB = hashUserIdentity('bob@example.com');

    expect(hashA).not.toEqual(hashB);
  });

  it('should handle case insensitivity cleanly', () => {
    const hashLower = hashUserIdentity('richard@portfolio.com');
    const hashUpper = hashUserIdentity('RICHARD@PORTFOLIO.COM');

    expect(hashLower).toEqual(hashUpper);
  });
});
