import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CreateBillingRecordRequest } from '../../contracts';
import * as client from '../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../lib/apiClient';
import { makeBill } from '../../test/fixtures';
import { useBillingRecords } from '../useBillingRecords';

vi.mock('../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
type CommandFn = (path: string, options: RequestOptions) => Promise<void>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;
const apiCommand = client.apiCommand as unknown as Mock<CommandFn>;

const RECORDS_PATH = '/api/billing-records';
const listLoads = () => apiRequest.mock.calls.filter(([path, , options]) => path === RECORDS_PATH && !options?.method).length;

const newBill: CreateBillingRecordRequest = {
  phaseId: 'p1',
  category: 'WATER',
  cadence: 'QUARTERLY',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  amountMinor: 4500,
  vendor: 'Canal',
};

function serve(records = [makeBill()]) {
  apiRequest.mockImplementation(async (path, _schema, options) => {
    if (options?.method === 'POST') return { id: 'new-bill' };
    if (path === RECORDS_PATH) return { records };
    throw new Error(`unexpected request ${path}`);
  });
}

beforeEach(() => {
  apiRequest.mockReset();
  apiCommand.mockReset();
  apiCommand.mockResolvedValue(undefined);
});

describe('useBillingRecords loading', () => {
  it('loads every bill once enabled, not before', async () => {
    serve();

    const { result, rerender } = renderHook(({ enabled }) => useBillingRecords(enabled, null), { initialProps: { enabled: false } });
    expect(listLoads()).toBe(0);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.records.map((record) => record.id)).toEqual(['b1']);
  });

  it('loads again when the phases it belongs to change (a deleted phase takes its bills with it)', async () => {
    serve();
    const { result, rerender } = renderHook(({ version }) => useBillingRecords(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ version: 2 });

    await waitFor(() => expect(listLoads()).toBe(2));
  });

  it('reports a failed load without losing the bills already shown', async () => {
    apiRequest.mockResolvedValueOnce({ records: [makeBill()] }).mockRejectedValueOnce(new ApiError(500, 'Boom', { error: 'Boom' }));
    const { result, rerender } = renderHook(({ version }) => useBillingRecords(true, version), { initialProps: { version: 1 } });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ version: 2 });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.records).toHaveLength(1);
    expect(result.current.message).toBe('Boom');
  });
});

describe('useBillingRecords changes', () => {
  it('logs a bill, reloads the list, and tells the page so the trends can refresh', async () => {
    serve();
    const onChanged = vi.fn();
    const { result } = renderHook(() => useBillingRecords(true, null, onChanged));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let outcome: Awaited<ReturnType<typeof result.current.createBill>> | undefined;
    await act(async () => {
      outcome = await result.current.createBill(newBill);
    });

    expect(outcome).toEqual({ ok: true, value: { id: 'new-bill' } });
    expect(apiRequest).toHaveBeenCalledWith(RECORDS_PATH, expect.anything(), { method: 'POST', body: newBill });
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(listLoads()).toBe(2));
  });

  it('changes a bill with a PATCH and removes one with a DELETE, each telling the page', async () => {
    serve();
    const onChanged = vi.fn();
    const { result } = renderHook(() => useBillingRecords(true, null, onChanged));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.updateBill('b 1', { amountMinor: 10000 });
      await result.current.deleteBill('b 1');
    });

    expect(apiCommand).toHaveBeenNthCalledWith(1, `${RECORDS_PATH}/b%201`, { method: 'PATCH', body: { amountMinor: 10000 } });
    expect(apiCommand).toHaveBeenNthCalledWith(2, `${RECORDS_PATH}/b%201`, { method: 'DELETE' });
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('hands back a typed failure and does not refresh anything when a change is rejected', async () => {
    serve();
    apiRequest.mockImplementationOnce(async () => ({ records: [makeBill()] }));
    const onChanged = vi.fn();
    const { result } = renderHook(() => useBillingRecords(true, null, onChanged));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    apiRequest.mockRejectedValueOnce(
      new ApiError(400, 'Invalid request', { error: 'Invalid request', issues: [{ path: 'periodEnd', message: 'Too early' }] })
    );

    let outcome: Awaited<ReturnType<typeof result.current.createBill>> | undefined;
    await act(async () => {
      outcome = await result.current.createBill(newBill);
    });

    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'validation', issues: [{ path: 'periodEnd', message: 'Too early' }] } });
    expect(onChanged).not.toHaveBeenCalled();
    expect(listLoads()).toBe(1);
  });

  it('says so when the phase of a new bill no longer exists', async () => {
    serve();
    const { result } = renderHook(() => useBillingRecords(true, null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    apiRequest.mockRejectedValueOnce(new ApiError(404, 'living phase not found', { error: 'living phase not found' }));

    let outcome: Awaited<ReturnType<typeof result.current.createBill>> | undefined;
    await act(async () => {
      outcome = await result.current.createBill(newBill);
    });

    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'not-found' } });
  });
});
