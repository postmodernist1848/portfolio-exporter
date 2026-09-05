import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), save: vi.fn() }));
vi.mock('./client', () => ({ prisma: {
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ $queryRaw: mocks.query })
} }));
vi.mock('./portfolio-repository', () => ({ saveSnapshot: mocks.save }));
import { collectWithDatabaseLock } from './collection-lock';

describe('database collection coordination', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not contact providers when another instance owns the lock', async () => {
    mocks.query.mockResolvedValueOnce([{ acquired: false }]);
    const collect = vi.fn();
    expect(await collectWithDatabaseLock(collect)).toEqual({ state: 'in_progress', snapshot: null });
    expect(collect).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('enforces the persisted cooldown on a fresh instance', async () => {
    mocks.query.mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([{ cooling: true }]);
    const collect = vi.fn();
    expect(await collectWithDatabaseLock(collect)).toEqual({ state: 'cooldown', snapshot: null });
    expect(collect).not.toHaveBeenCalled();
  });

  it('saves through the lock transaction only after collection finishes', async () => {
    mocks.query.mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([{ cooling: false }]);
    const snapshot = { capturedAt: '2026-09-05T00:00:00Z', totalRub: 0,
      status: 'complete' as const, freshSourceCount: 0, staleSourceCount: 0,
      errorSourceCount: 0, components: [] };
    const result = await collectWithDatabaseLock(async () => snapshot);
    expect(result).toEqual({ state: 'completed', snapshot });
    expect(mocks.save).toHaveBeenCalledWith(snapshot, { $queryRaw: mocks.query });
  });

  it('propagates failures without saving a false successful snapshot', async () => {
    mocks.query.mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([{ cooling: false }]);
    await expect(collectWithDatabaseLock(async () => { throw new Error('failure'); }))
      .rejects.toThrow('failure');
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
