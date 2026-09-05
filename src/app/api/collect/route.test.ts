import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ after: vi.fn(), collect: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(), after: mocks.after
}));
vi.mock('@/lib/services/collection-coordinator', () => ({ requestPublicCollection: mocks.collect }));
import { POST } from './route';

describe('collection route', () => {
  beforeEach(() => vi.resetAllMocks());

  it('acknowledges cron immediately and runs collection in the managed after callback', async () => {
    mocks.collect.mockResolvedValue({ state: 'completed', snapshot: null });
    const response = await POST(new Request('https://example.com/api/collect?background=1', { method: 'POST' }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: 'accepted' });
    expect(mocks.collect).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.collect).toHaveBeenCalledTimes(1);
  });

  it('preserves the synchronous dashboard response', async () => {
    mocks.collect.mockResolvedValue({ state: 'cooldown', snapshot: null });
    const response = await POST(new Request('https://example.com/api/collect', { method: 'POST' }));
    expect(await response.json()).toEqual({ state: 'cooldown', snapshot: null });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('does not print background failure credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.collect.mockRejectedValue(new Error('secret-credential'));
    await POST(new Request('https://example.com/api/collect?background=1', { method: 'POST' }));
    await mocks.after.mock.calls[0][0]();
    expect(log).toHaveBeenCalledWith('[collection] background failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-credential');
    log.mockRestore();
  });
});
