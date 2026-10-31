import { readFileSync } from 'fs';
import { join } from 'path';
import jwt from 'jsonwebtoken';
import { generateToken, verifyToken } from '../lib/auth';

describe('JWT Authentication & Security Tokens', () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  it('should generate a valid signed JWT for a given userId', () => {
    const userId = 'usr_test_12345';
    const token = generateToken(userId);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded: any = jwt.decode(token);
    expect(decoded.userId).toBe(userId);
  });

  it('reads the secret when it is used, not when the module loads, so dotenv can run first', () => {
    process.env.JWT_SECRET = 'a-secret-set-after-the-module-was-imported';

    const token = generateToken('usr_1');

    expect(jwt.verify(token, 'a-secret-set-after-the-module-was-imported')).toMatchObject({ userId: 'usr_1' });
    expect(verifyToken(token)).toMatchObject({ userId: 'usr_1' });
  });

  it('refuses to sign without a secret instead of falling back to a built-in one', () => {
    delete process.env.JWT_SECRET;

    expect(() => generateToken('usr_1')).toThrow(/JWT_SECRET/);
  });

  it('fails loudly when verifying without a secret, rather than treating every token as merely invalid', () => {
    const token = generateToken('usr_1');
    delete process.env.JWT_SECRET;

    expect(() => verifyToken(token)).toThrow(/JWT_SECRET/);
  });

  it('does not accept tokens signed with the old hard-coded secret', () => {
    process.env.JWT_SECRET = 'the-real-secret';
    const forged = jwt.sign({ userId: 'usr_victim' }, 'portfolio_tracker_super_secret_jwt_key_2026_9f8a3b');

    expect(verifyToken(forged)).toBeNull();
  });

  it('is only configured after dotenv: index.ts must load it before any other import', () => {
    const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    const firstImport = source.split('\n').find((line) => line.startsWith('import '));

    expect(firstImport).toBe("import 'dotenv/config';");
  });
});
