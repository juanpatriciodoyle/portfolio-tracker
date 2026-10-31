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
