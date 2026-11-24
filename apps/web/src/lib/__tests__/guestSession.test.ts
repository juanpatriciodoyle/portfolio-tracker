import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memoryStorage';
import { GUEST_ENDED_KEY, clearGuestEndedNotice, endGuestSession, isGuestUser, leaveEndedGuestSession, peekGuestEndedNotice } from '../guestSession';

describe('isGuestUser', () => {
  it('recognises the demo guest by the flag the server sends', () => {
    expect(isGuestUser({ isGuest: true })).toBe(true);
  });

  it('still recognises a guest session kept from before the flag existed', () => {
    expect(isGuestUser({ email: 'demo@portfolio.local' })).toBe(true);
  });

  it('does not mistake a real account for the guest', () => {
    expect(isGuestUser({ email: 'ana@example.com', isGuest: false })).toBe(false);
    expect(isGuestUser({ isGuest: false })).toBe(false);
    expect(isGuestUser(null)).toBe(false);
  });
});

describe('endGuestSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server to erase the guest’s account, as the guest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await endGuestSession({ isGuest: true }, 'guest-token');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/demo/end');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer guest-token');
  });

  it('never calls the server for a real account', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await endGuestSession({ email: 'ana@example.com', isGuest: false }, 'ana-token');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the guest sign out even when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(endGuestSession({ isGuest: true }, 'guest-token')).resolves.toBeUndefined();
  });
});

describe('when a guest’s hour is over', () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('sessionStorage', createMemoryStorage());
    vi.stubGlobal('location', { reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the session, remembers to say so, and starts again at the sign-in screen', () => {
    localStorage.setItem('auth_token', 'guest-token');
    localStorage.setItem('auth_user', '{}');

    const handled = leaveEndedGuestSession(401, { error: 'ended', code: 'GUEST_SESSION_ENDED' });

    expect(handled).toBe(true);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
    expect(sessionStorage.getItem(GUEST_ENDED_KEY)).toBe('1');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves every other answer alone, including other 401s', () => {
    localStorage.setItem('auth_token', 'token');

    expect(leaveEndedGuestSession(401, { error: 'signed out' })).toBe(false);
    expect(leaveEndedGuestSession(403, { code: 'GUEST_SESSION_ENDED' })).toBe(false);
    expect(leaveEndedGuestSession(401, null)).toBe(false);
    expect(localStorage.getItem('auth_token')).toBe('token');
    expect(reload).not.toHaveBeenCalled();
  });

  it('is told until the notice is cleared, and then no more', () => {
    expect(peekGuestEndedNotice()).toBe(false);
    sessionStorage.setItem(GUEST_ENDED_KEY, '1');

    expect(peekGuestEndedNotice()).toBe(true);
    expect(peekGuestEndedNotice()).toBe(true);
    clearGuestEndedNotice();
    expect(peekGuestEndedNotice()).toBe(false);
  });
});
