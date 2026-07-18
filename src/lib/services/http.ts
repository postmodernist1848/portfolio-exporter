import { randomUUID } from 'node:crypto';
import { Agent } from 'undici';
import type { ZodType } from 'zod';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 500;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

type RequestContext = {
  provider?: string;
  operation?: string;
  timeoutMs?: number;
  attempts?: number;
  allowSelfSignedTls?: boolean;
};
let selfSignedAgent: Agent | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function isRetryable(error: unknown): boolean {
  return error instanceof HttpError
    ? error.status === 408 || error.status === 429 || error.status >= 500
    : error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

function safeError(error: unknown): string {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  if (error instanceof Error && error.name === 'AbortError') return 'request timed out';
  return 'network request failed';
}

async function requestText(
  url: string,
  init: RequestInit = {},
  context: RequestContext = {}
): Promise<string> {
  const requestId = randomUUID();
  const method = (init.method ?? 'GET').toUpperCase();
  const attempts = context.attempts ?? DEFAULT_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const requestInit: RequestInit & { dispatcher?: Agent } = {
        ...init,
        cache: 'no-store',
        signal: controller.signal
      };
      if (context.allowSelfSignedTls) {
        selfSignedAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
        requestInit.dispatcher = selfSignedAgent;
      }
      const response = await fetch(url, requestInit);
      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}`,
          response.status,
          retryAfterMs(response.headers.get('retry-after'))
        );
      }
      const body = await response.text();
      console.info('[http] request completed', {
        provider: context.provider ?? 'external',
        operation: context.operation ?? 'request',
        requestId,
        method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        attempt
      });
      return body;
    } catch (error) {
      lastError = error;
      const retryable = isRetryable(error);
      console.warn('[http] request failed', {
        provider: context.provider ?? 'external',
        operation: context.operation ?? 'request',
        requestId,
        method,
        status: error instanceof HttpError ? error.status : undefined,
        durationMs: Date.now() - startedAt,
        attempt,
        retryable,
        error: safeError(error)
      });
      if (!retryable || attempt === attempts) break;
      const exponential = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      const jittered = exponential * (0.75 + Math.random() * 0.5);
      await sleep(error instanceof HttpError && error.retryAfterMs !== undefined
        ? error.retryAfterMs
        : jittered);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('External request failed');
}

export async function getJson<T>(
  url: string,
  init?: RequestInit,
  schema?: ZodType<T>,
  context?: RequestContext
): Promise<T> {
  const body = await requestText(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) }
  }, context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Provider returned invalid JSON');
  }
  return schema ? schema.parse(parsed) : parsed as T;
}

export async function getText(
  url: string,
  init?: RequestInit,
  context?: RequestContext
): Promise<string> {
  return requestText(url, init, context);
}
