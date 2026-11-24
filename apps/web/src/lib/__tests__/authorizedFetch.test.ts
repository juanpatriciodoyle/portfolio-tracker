import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memoryStorage';
import { authorizedFetch } from '../authorizedFetch';

describe('authorizedFetch', () => {
  const fetchMock = vi.fn();
  let storage: Storage;

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentHeaders = () => new Headers(fetchMock.mock.calls[0][1].headers);

  it('identifies the user with the bearer token and nothing in the URL', async () => {
    storage.setItem('auth_token', 'tok-123');

    await authorizedFetch('/api/transactions');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/transactions');
    expect(sentHeaders().get('Authorization')).toBe('Bearer tok-123');
  });

  it('sends no Authorization header when signed out', async () => {
    await authorizedFetch('/api/transactions');

    expect(sentHeaders().has('Authorization')).toBe(false);
  });

  it('keeps the caller’s method, body and headers', async () => {
    storage.setItem('auth_token', 't');

    await authorizedFetch('/api/user/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(sentHeaders().get('Content-Type')).toBe('application/json');
  });

  it('treats unreadable storage as signed out', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });

    await authorizedFetch('/api/transactions');

    expect(sentHeaders().has('Authorization')).toBe(false);
  });
});

describe('authorizedFetch: a demo guest whose hour is over', () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'guest-token', auth_user: '{}' }));
    vi.stubGlobal('sessionStorage', createMemoryStorage());
    vi.stubGlobal('location', { reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is taken back to the sign-in screen when the server says the demo session ended', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'ended', code: 'GUEST_SESSION_ENDED' }), { status: 401 })));

    const response = await authorizedFetch('/api/portfolio/stats');

    expect(response.status).toBe(401);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('is left alone for any other 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'You are signed out.' }), { status: 401 })));

    await authorizedFetch('/api/portfolio/stats');

    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth_token')).toBe('guest-token');
  });
});
