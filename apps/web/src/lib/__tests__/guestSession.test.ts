import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endGuestSession, isGuestUser } from '../guestSession';

describe('isGuestUser', () => {
  it('recognises Joe, the sneak-peek account', () => {
    expect(isGuestUser({ email: 'demo@portfolio.local', name: 'Joe' })).toBe(true);
  });

  it('does not mistake a real account for the guest', () => {
    expect(isGuestUser({ email: 'ana@example.com', name: 'Ana' })).toBe(false);
    expect(isGuestUser(null)).toBe(false);
  });
});

describe('endGuestSession', () => {
  beforeEach(() => {
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server to wipe the guest’s changes, as the guest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await endGuestSession({ email: 'demo@portfolio.local', name: 'Joe' }, 'guest-token');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/demo/reset');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer guest-token');
  });

  it('never calls the server for a real account', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await endGuestSession({ email: 'ana@example.com', name: 'Ana' }, 'ana-token');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the guest sign out even when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(endGuestSession({ email: 'demo@portfolio.local', name: 'Joe' }, 'guest-token')).resolves.toBeUndefined();
  });
});
