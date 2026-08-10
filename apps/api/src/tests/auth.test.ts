import { generateToken } from '../lib/auth';
import jwt from 'jsonwebtoken';

describe('JWT Authentication & Security Tokens', () => {
  it('should generate a valid signed JWT for a given userId', () => {
    const userId = 'usr_test_12345';
    const token = generateToken(userId);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded: any = jwt.decode(token);
    expect(decoded.userId).toBe(userId);
  });
});
