import { generateToken, verifyToken } from '../lib/auth';

describe('session token claims', () => {
  it('is an ordinary session unless the admin claim was given', () => {
    expect(verifyToken(generateToken('user-1'))).toEqual({ userId: 'user-1', admin: false });
    expect(verifyToken(generateToken('user-1', { admin: false }))).toEqual({ userId: 'user-1', admin: false });
  });

  it('carries the admin claim the server signed in', () => {
    expect(verifyToken(generateToken('user-1', { admin: true }))).toEqual({ userId: 'user-1', admin: true });
  });

  it('cannot be turned into an admin session by editing the token', () => {
    const [header, , signature] = generateToken('user-1').split('.');
    const forgedBody = Buffer.from(JSON.stringify({ userId: 'user-1', admin: true })).toString('base64url');
    expect(verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull();
  });
});
