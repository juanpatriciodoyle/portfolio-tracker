import { hashUserIdentity } from '../lib/privacy';

describe('Zero-Knowledge Privacy & Security Hashing', () => {
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
