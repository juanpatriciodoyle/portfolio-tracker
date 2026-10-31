import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED, idResponse } from '../../contracts';
import { ApiContractError, ApiError, apiCommand, apiRequest } from '../apiClient';
import { createMemoryStorage } from '../../test/memoryStorage';
import { attempt, classifyApiError, combineStatuses, statusFromFailure } from '../apiErrors';

function reply(status: number, body: unknown, statusText = '') {
  return {
    ok: status < 400,
    status,
    statusText,
    json: async () => {
      if (body === undefined) throw new SyntaxError('no body');
      return body;
    },
  } as Response;
}

describe('apiRequest', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the saved token as a bearer header and parses the answer with the schema', async () => {
    storage.setItem('auth_token', 'secret-token');
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { id: 'p1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('/api/living-phases', idResponse);

    expect(result).toEqual({ id: 'p1' });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/living-phases');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(init.body).toBeUndefined();
  });

  it('treats unreadable storage as signed out instead of failing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { id: 'p1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/x', idResponse)).resolves.toEqual({ id: 'p1' });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('sends no Authorization header when nobody is signed in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { id: 'p1' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/x', idResponse);

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('sends JSON bodies with a content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { id: 'p2' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/living-phases', idResponse, { method: 'POST', body: { name: 'Madrid' } });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'Madrid' });
  });

  it('throws an ApiError carrying the status, the server message and the raw body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404, { error: 'Living phase not found' })));

    const error = await apiRequest('/api/x', idResponse).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Living phase not found', body: { error: 'Living phase not found' } });
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(502, undefined, 'Bad Gateway')));

    await expect(apiRequest('/api/x', idResponse)).rejects.toMatchObject({ status: 502, message: 'Bad Gateway', body: null });
  });

  it('throws an ApiContractError when a successful answer breaks the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { id: 42 })));

    const error = await apiRequest('/api/x', idResponse).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiContractError);
    expect((error as ApiContractError).issues[0]).toContain('id');
  });
});

describe('apiCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with nothing for a 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, statusText: 'No Content' } as Response));

    await expect(apiCommand('/api/profile', { method: 'PUT', body: {} })).resolves.toBeUndefined();
  });

  it('throws an ApiError for a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: 'Access denied' })));

    await expect(apiCommand('/api/profile', { method: 'PUT', body: {} })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('classifyApiError', () => {
  it.each([401, 403])('treats %d as signed out', (status) => {
    expect(classifyApiError(new ApiError(status, 'nope', null)).kind).toBe('signed-out');
  });

  it('recognises the missing encryption key', () => {
    const failure = classifyApiError(
      new ApiError(503, 'Profile encryption is not configured', { error: 'x', code: ENCRYPTION_NOT_CONFIGURED })
    );

    expect(failure.kind).toBe('encryption-unavailable');
  });

  it('keeps other 503s as ordinary errors', () => {
    expect(classifyApiError(new ApiError(503, 'Down', { error: 'Down' })).kind).toBe('unknown');
  });

  it('carries validation issues by field path', () => {
    const failure = classifyApiError(
      new ApiError(400, 'Invalid request', { error: 'Invalid request', issues: [{ path: 'endDate', message: 'Too early' }] })
    );

    expect(failure).toMatchObject({ kind: 'validation', issues: [{ path: 'endDate', message: 'Too early' }] });
  });

  it('carries the ids of overlapping phases', () => {
    const failure = classifyApiError(
      new ApiError(409, 'Phases overlap', { error: 'Phases overlap', conflictingPhaseIds: ['a', 'b'] })
    );

    expect(failure).toMatchObject({ kind: 'overlap', conflictingPhaseIds: ['a', 'b'] });
  });

  it('does not call a malformed 409 an overlap', () => {
    expect(classifyApiError(new ApiError(409, 'Conflict', { error: 'Conflict' })).kind).toBe('unknown');
  });

  it('classifies missing things, dropped connections and contract breaks', () => {
    expect(classifyApiError(new ApiError(404, 'Gone', null)).kind).toBe('not-found');
    expect(classifyApiError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifyApiError(new ApiContractError('/x', ['id: bad'])).kind).toBe('unknown');
    expect(classifyApiError('weird')).toMatchObject({ kind: 'unknown' });
  });
});

describe('attempt and statuses', () => {
  it('wraps success and failure in a result', async () => {
    expect(await attempt(async () => 7)).toEqual({ ok: true, value: 7 });

    const failed = await attempt(async () => {
      throw new ApiError(404, 'Gone', null);
    });
    expect(failed).toMatchObject({ ok: false, failure: { kind: 'not-found' } });
  });

  it('maps failures onto load statuses', () => {
    expect(statusFromFailure({ kind: 'signed-out', message: '' })).toBe('signed-out');
    expect(statusFromFailure({ kind: 'encryption-unavailable', message: '' })).toBe('encryption-unavailable');
    expect(statusFromFailure({ kind: 'network', message: '' })).toBe('error');
  });

  it('shows the most important status across several loads', () => {
    expect(combineStatuses('ready', 'ready')).toBe('ready');
    expect(combineStatuses('loading', 'ready')).toBe('loading');
    expect(combineStatuses('error', 'loading')).toBe('error');
    expect(combineStatuses('ready', 'encryption-unavailable', 'error')).toBe('encryption-unavailable');
    expect(combineStatuses('signed-out', 'encryption-unavailable')).toBe('signed-out');
  });
});
