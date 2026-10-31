import type { z } from 'zod';
import { apiErrorResponse } from '../contracts';
import { readAuthToken } from './authorizedFetch';

/** The server answered with an error status. `body` is whatever JSON it sent, unparsed. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** The server answered successfully but not with the shape its contract promises. */
export class ApiContractError extends Error {
  readonly issues: string[];

  constructor(path: string, issues: string[]) {
    super(`Unexpected response from ${path}`);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

/** A file sent as it is (no JSON, no form): the body is the file's own bytes. */
interface RawUpload {
  file: Blob;
  contentType: string;
}

async function send(
  path: string,
  { method = 'GET', body, signal }: RequestOptions,
  upload?: RawUpload
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = readAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (upload) headers['Content-Type'] = upload.contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: upload ? upload.file : body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    const parsed = apiErrorResponse.safeParse(errorBody);
    throw new ApiError(response.status, parsed.success ? parsed.data.error : response.statusText || 'Request failed', errorBody);
  }
  return response;
}

/** Calls the API and returns the response parsed with its contract schema. */
export async function apiRequest<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiContractError(
      path,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    );
  }
  return parsed.data;
}

/** Sends one file as the raw request body (POST) and returns the answer parsed with its contract schema. */
export async function apiUpload<T>(
  path: string,
  file: Blob,
  contentType: string,
  schema: z.ZodType<T>,
  options: { signal?: AbortSignal } = {}
): Promise<T> {
  const response = await send(path, { method: 'POST', signal: options.signal }, { file, contentType });
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiContractError(path, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  return parsed.data;
}

/** For endpoints that answer 204 No Content. */
export async function apiCommand(path: string, options: RequestOptions): Promise<void> {
  await send(path, options);
}
