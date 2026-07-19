import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/client', () => ({
  prisma: {
    portfolioSnapshot: { findMany, upsert }
  }
}));

describe('portfolio history repository', () => {
  it('selects the newest bounded rows and returns chronological chart order', async () => {
    findMany.mockResolvedValue([
      { capturedAt: new Date('2026-01-03T00:00:00.000Z'), totalRub: 300 },
      { capturedAt: new Date('2026-01-02T00:00:00.000Z'), totalRub: 200 }
    ]);
    const { getTotalHistory } = await import('./portfolio-repository');
    const result = await getTotalHistory(2, 'all');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { capturedAt: 'desc' },
      take: 2
    }));
    expect(result.map((point) => point.totalRub)).toEqual([200, 300]);
  });

  it('uses deleteMany only in the update branch of snapshot upsert', async () => {
    upsert.mockResolvedValue({});
    const { saveSnapshot } = await import('./portfolio-repository');
    await saveSnapshot({
      capturedAt: '2026-01-03T00:00:00.000Z',
      totalRub: 100,
      status: 'complete',
      freshSourceCount: 1,
      staleSourceCount: 0,
      errorSourceCount: 0,
      components: [{
        sourceId: 'crypto',
        sourceName: 'Crypto',
        totalRub: 100,
        capturedAt: '2026-01-03T00:00:00.000Z',
        observedAt: '2026-01-03T00:00:00.000Z',
        status: 'ok',
        details: {
          kind: 'bcs',
          positions: [{ ticker: 'TEST', name: undefined }]
        }
      }]
    });

    const call = upsert.mock.calls[0][0];
    expect(call.update.components.deleteMany).toEqual({});
    expect(call.create.components).not.toHaveProperty('deleteMany');
    expect(call.create.components.create).toHaveLength(1);
    expect(call.create.components.create[0].details.positions[0]).toEqual({ ticker: 'TEST' });
  });
});
