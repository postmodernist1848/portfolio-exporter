import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioSnapshot } from '@/types/portfolio';

const state = vi.hoisted(() => ({
  resolveCrypto: null as null | (() => void),
  fetchCrypto: vi.fn(),
  saveSnapshot: vi.fn(),
  latest: null as PortfolioSnapshot | null
}));

vi.mock('@/lib/db/portfolio-repository', () => ({
  getLatestSnapshot: vi.fn(async () => state.latest),
  saveSnapshot: state.saveSnapshot,
  getLatestSuccessfulComponent: vi.fn(async (sourceId: string) => sourceId === 'bcs' ? {
    sourceId: 'bcs',
    sourceName: 'БКС',
    totalRub: 50,
    capturedAt: '2026-01-01T00:00:00.000Z',
    observedAt: '2026-01-01T00:00:00.000Z',
    status: 'ok'
  } : null)
}));

vi.mock('@/lib/sources', () => ({
  getPortfolioSources: () => [
    {
      id: 'crypto',
      name: 'Crypto',
      fetchSnapshot: state.fetchCrypto
    },
    {
      id: 'bcs',
      name: 'BCS',
      fetchSnapshot: vi.fn(async () => { throw new Error('provider detail'); })
    },
    {
      id: 'okx',
      name: 'OKX',
      fetchSnapshot: vi.fn(async () => ({
        sourceId: 'okx',
        sourceName: 'OKX',
        totalRub: 0,
        status: 'disabled'
      }))
    }
  ]
}));

describe('collection coordinator', () => {
  beforeEach(() => {
    state.saveSnapshot.mockReset();
    state.fetchCrypto.mockReset();
    state.latest = null;
  });

  it('coalesces concurrent triggers and preserves a stale source value', async () => {
    state.fetchCrypto.mockImplementation(() => new Promise((resolve) => {
      state.resolveCrypto = () => resolve({
        sourceId: 'crypto',
        sourceName: 'Crypto',
        totalRub: 100,
        observedAt: '2026-01-02T00:00:00.000Z',
        status: 'ok'
      });
    }));
    const { requestPublicCollection } = await import('./collection-coordinator');
    const first = requestPublicCollection();
    await vi.waitFor(() => expect(state.fetchCrypto).toHaveBeenCalledTimes(1));
    await expect(requestPublicCollection()).resolves.toMatchObject({ state: 'in_progress' });
    state.resolveCrypto?.();

    const completed = await first;
    expect(completed.state).toBe('completed');
    expect(completed.snapshot?.totalRub).toBe(150);
    expect(completed.snapshot?.status).toBe('partial');
    expect(completed.snapshot?.components.find((item) => item.sourceId === 'bcs')).toMatchObject({
      totalRub: 50,
      status: 'stale'
    });
    expect(state.fetchCrypto).toHaveBeenCalledTimes(1);
    expect(state.saveSnapshot).toHaveBeenCalledTimes(1);
    await expect(requestPublicCollection()).resolves.toMatchObject({ state: 'cooldown' });
  });
});
