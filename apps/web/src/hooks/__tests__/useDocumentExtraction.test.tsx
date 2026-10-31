import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DOCUMENT_BYTES, type ExtractionResponse } from '../../contracts';
import { createMemoryStorage } from '../../test/memoryStorage';
import { useDocumentExtraction } from '../useDocumentExtraction';

const extraction: ExtractionResponse = {
  draft: { amountMinor: 9650, currency: 'EUR', vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30' },
  textFound: true,
  pages: 2,
  suggestedPhaseId: 'p1',
};

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', json: async () => body }) as Response;
const pdf = (size = 100, type = 'application/pdf', name = 'bill.pdf') => new File([new Uint8Array(size)], name, { type });

describe('useDocumentExtraction', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'tok' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the PDF, then hands over the typed draft', async () => {
    fetchMock.mockResolvedValue(reply(200, extraction));
    const file = pdf();

    const { result } = renderHook(() => useDocumentExtraction(file, 'p9'));

    expect(result.current.status).toBe('reading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.result).toEqual(extraction);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/documents/extract?phaseId=p9');
    expect(init.body).toBe(file);
    expect(init.headers['Content-Type']).toBe('application/pdf');
  });

  it('asks without a phase when none was opened from', async () => {
    fetchMock.mockResolvedValue(reply(200, extraction));

    const file = pdf();
    renderHook(() => useDocumentExtraction(file, undefined));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/documents/extract');
  });

  it('refuses a file that is not a PDF without sending anything', async () => {
    const file = pdf(10, 'image/png', 'scan.png');
    const { result } = renderHook(() => useDocumentExtraction(file, undefined));

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.failure).toMatchObject({ kind: 'document', code: 'NOT_A_PDF' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an oversized file without sending anything', async () => {
    const file = pdf(MAX_DOCUMENT_BYTES + 1);
    const { result } = renderHook(() => useDocumentExtraction(file, undefined));

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.failure).toMatchObject({ kind: 'document', code: 'DOCUMENT_TOO_LARGE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a server refusal and can try again', async () => {
    const file = pdf();
    fetchMock.mockResolvedValueOnce(reply(503, { error: 'busy', code: 'EXTRACTION_BUSY' })).mockResolvedValueOnce(reply(200, extraction));

    const { result } = renderHook(() => useDocumentExtraction(file, undefined));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.failure).toMatchObject({ kind: 'document', code: 'EXTRACTION_BUSY' });

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('abandons the request when the hook goes away', async () => {
    const file = pdf();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_path: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useDocumentExtraction(file, undefined));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
