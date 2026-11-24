import { describe, expect, it, vi } from 'vitest';

const support = vi.hoisted(() => ({ webauthn: true }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => support.webauthn,
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

import { mayAddPasskey } from '../passkeys';

describe('who is offered "add a passkey"', () => {
  it('an ordinary account, on a browser that has passkeys', () => {
    support.webauthn = true;
    expect(mayAddPasskey({ isGuest: false, isAdmin: false })).toBe(true);
  });

  it('never the demo guest, and never the administrator', () => {
    support.webauthn = true;
    expect(mayAddPasskey({ isGuest: true })).toBe(false);
    expect(mayAddPasskey({ isAdmin: true })).toBe(false);
  });

  it('nobody, on a browser without passkeys', () => {
    support.webauthn = false;
    expect(mayAddPasskey({ isGuest: false, isAdmin: false })).toBe(false);
  });
});
