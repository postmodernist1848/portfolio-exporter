import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/client', () => ({
  prisma: {
    portfolioSnapshot: { findMany }
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
});
