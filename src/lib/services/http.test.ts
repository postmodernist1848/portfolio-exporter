import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getJson } from './http';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('HTTP client', () => {
  it('does not retry non-retryable 4xx responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('secret response', { status: 401 })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(getJson('https://provider.test/private', undefined, z.object({ ok: z.boolean() })))
      .rejects.toThrow('HTTP 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx response and never logs the response body', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('sensitive payload', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const promise = getJson(
      'https://provider.test/private',
      undefined,
      z.object({ ok: z.boolean() }),
      { attempts: 2 }
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive payload');
  });

  it('rejects malformed successful JSON through runtime validation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"total":null}', { status: 200 })
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(getJson(
      'https://provider.test/value',
      undefined,
      z.object({ total: z.number() })
    )).rejects.toThrow();
  });
});
