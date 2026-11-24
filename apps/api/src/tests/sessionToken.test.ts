import jwt from 'jsonwebtoken';
import { generateToken, verifyToken } from '../lib/auth';

const lifetimeSeconds = (token: string) => {
  const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };
  return exp - iat;
};

describe('session token claims', () => {
  it('is an ordinary session unless the admin claim was given', () => {
    expect(verifyToken(generateToken('user-1'))).toEqual({ userId: 'user-1', admin: false, guest: false });
    expect(verifyToken(generateToken('user-1', { admin: false }))).toEqual({ userId: 'user-1', admin: false, guest: false });
  });

  it('carries the admin claim the server signed in', () => {
    expect(verifyToken(generateToken('user-1', { admin: true }))).toEqual({ userId: 'user-1', admin: true, guest: false });
  });

  it('cannot be turned into an admin session by editing the token', () => {
    const [header, , signature] = generateToken('user-1').split('.');
    const forgedBody = Buffer.from(JSON.stringify({ userId: 'user-1', admin: true })).toString('base64url');
    expect(verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull();
  });
});

describe('a demo guest session token', () => {
  it('says it belongs to a guest', () => {
    expect(verifyToken(generateToken('guest-1', { guest: true }))).toEqual({ userId: 'guest-1', admin: false, guest: true });
  });

  it('lasts one hour, while an ordinary session lasts 30 days', () => {
    expect(lifetimeSeconds(generateToken('guest-1', { guest: true }))).toBe(3600);
    expect(lifetimeSeconds(generateToken('user-1'))).toBe(30 * 24 * 3600);
  });

  it('can never be an administrator, even if both claims are asked for', () => {
    expect(verifyToken(generateToken('guest-1', { guest: true, admin: true }))).toEqual({ userId: 'guest-1', admin: false, guest: true });
  });

  it('cannot be turned into an ordinary session by dropping the claim', () => {
    const [header, , signature] = generateToken('guest-1', { guest: true }).split('.');
    const forgedBody = Buffer.from(JSON.stringify({ userId: 'guest-1' })).toString('base64url');
    expect(verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull();
  });
});
