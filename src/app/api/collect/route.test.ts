import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ after: vi.fn(), collect: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(), after: mocks.after
}));
vi.mock('@/lib/services/collection-coordinator', () => ({ requestPublicCollection: mocks.collect }));
import { POST } from './route';

describe('collection route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PORTFOLIO_AUTH_USERNAME', 'portfolio');
    vi.stubEnv('PORTFOLIO_AUTH_PASSWORD', 'test-password');
  });
  afterEach(() => vi.unstubAllEnvs());

  function authenticatedRequest(url: string): Request {
    const authorization = `Basic ${Buffer.from('portfolio:test-password').toString('base64')}`;
    return new Request(url, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  it('acknowledges cron immediately and runs collection in the managed after callback', async () => {
    mocks.collect.mockResolvedValue({ state: 'completed', snapshot: null });
    const response = await POST(authenticatedRequest('https://example.com/api/collect?background=1'));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: 'accepted' });
    expect(mocks.collect).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.collect).toHaveBeenCalledTimes(1);
  });

  it('preserves the synchronous dashboard response', async () => {
    mocks.collect.mockResolvedValue({ state: 'cooldown', snapshot: null });
    const response = await POST(authenticatedRequest('https://example.com/api/collect'));
    expect(await response.json()).toEqual({ state: 'cooldown', snapshot: null });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('does not print background failure credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.collect.mockRejectedValue(new Error('secret-credential'));
    await POST(authenticatedRequest('https://example.com/api/collect?background=1'));
    await mocks.after.mock.calls[0][0]();
    expect(log).toHaveBeenCalledWith('[collection] background failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-credential');
    log.mockRestore();
  });

  it('rejects unauthenticated requests before starting collection', async () => {
    const response = await POST(new Request('https://example.com/api/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }));
    expect(response.status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('rejects authenticated form posts before starting collection', async () => {
    const authorization = `Basic ${Buffer.from('portfolio:test-password').toString('base64')}`;
    const response = await POST(new Request('https://example.com/api/collect', {
      method: 'POST', headers: { Authorization: authorization }
    }));
    expect(response.status).toBe(415);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
