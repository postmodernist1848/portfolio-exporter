import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { isPortfolioSourceId } from '@/lib/sources/metadata';
import type {
  PortfolioSnapshot,
  PortfolioSourceId,
  SnapshotStatus,
  SourceHistoryPoint,
  SourceSnapshot,
  SourceStatus
} from '@/types/portfolio';

export type HistoryRange = '24h' | '7d' | '30d' | 'all';

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

function toPrismaJson(
  value: Record<string, unknown> | undefined
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value ? value as Prisma.InputJsonValue : Prisma.JsonNull;
}

function sourceStatus(value: string | null | undefined): SourceStatus {
  return value === 'partial' || value === 'stale' || value === 'disabled' || value === 'error'
    ? value
    : 'ok';
}

function snapshotStatus(value: string | null | undefined): SnapshotStatus {
  return value === 'partial' ? 'partial' : 'complete';
}

type SnapshotRow = Prisma.PortfolioSnapshotGetPayload<{ include: { components: true } }>;

function mapSnapshot(row: SnapshotRow): PortfolioSnapshot {
  const components = row.components
    .filter((component) => isPortfolioSourceId(component.sourceId))
    .map((component): SourceSnapshot => ({
      sourceId: component.sourceId as PortfolioSourceId,
      sourceName: component.sourceName,
      totalRub: decimalToNumber(component.totalRub),
      capturedAt: row.capturedAt.toISOString(),
      observedAt: (component.observedAt ?? row.capturedAt).toISOString(),
      status: sourceStatus(component.status),
      errorMessage: component.errorMessage ?? undefined,
      details: (component.details as Record<string, unknown> | null) ?? undefined
    }));
  const storedCountTotal = row.freshSourceCount + row.staleSourceCount + row.errorSourceCount;
  const deriveLegacyCounts = storedCountTotal === 0 && components.some((item) => item.status !== 'disabled');
  return {
    capturedAt: row.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub),
    status: snapshotStatus(row.status),
    freshSourceCount: deriveLegacyCounts
      ? components.filter((item) => item.status === 'ok' || item.status === 'partial').length
      : row.freshSourceCount,
    staleSourceCount: deriveLegacyCounts
      ? components.filter((item) => item.status === 'stale').length
      : row.staleSourceCount,
    errorSourceCount: deriveLegacyCounts
      ? components.filter((item) => item.status === 'error').length
      : row.errorSourceCount,
    components
  };
}

export async function saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
  const data = {
    totalRub: snapshot.totalRub,
    status: snapshot.status,
    freshSourceCount: snapshot.freshSourceCount,
    staleSourceCount: snapshot.staleSourceCount,
    errorSourceCount: snapshot.errorSourceCount,
    components: {
      deleteMany: {},
      create: snapshot.components.map((component) => ({
        sourceId: component.sourceId,
        sourceName: component.sourceName,
        totalRub: component.totalRub,
        status: component.status,
        observedAt: new Date(component.observedAt),
        errorMessage: component.errorMessage,
        details: toPrismaJson(component.details)
      }))
    }
  };

  await prisma.portfolioSnapshot.upsert({
    where: { capturedAt: new Date(snapshot.capturedAt) },
    update: data,
    create: {
      capturedAt: new Date(snapshot.capturedAt),
      ...data
    }
  });
}

export async function getLatestSnapshot(): Promise<PortfolioSnapshot | null> {
  const row = await prisma.portfolioSnapshot.findFirst({
    orderBy: { capturedAt: 'desc' },
    include: { components: true }
  });
  return row ? mapSnapshot(row) : null;
}

export async function getLatestSnapshots(limit = 2): Promise<PortfolioSnapshot[]> {
  const rows = await prisma.portfolioSnapshot.findMany({
    orderBy: { capturedAt: 'desc' },
    take: Math.max(1, Math.min(limit, 10)),
    include: { components: true }
  });
  return rows.map(mapSnapshot);
}

export async function getLatestSuccessfulComponent(sourceId: PortfolioSourceId): Promise<SourceSnapshot | null> {
  const row = await prisma.snapshotComponent.findFirst({
    where: {
      sourceId,
      status: { in: ['ok', 'partial'] }
    },
    orderBy: { snapshot: { capturedAt: 'desc' } },
    include: { snapshot: { select: { capturedAt: true } } }
  });

  if (!row) {
    return null;
  }

  return {
    sourceId,
    sourceName: row.sourceName,
    totalRub: decimalToNumber(row.totalRub),
    capturedAt: row.snapshot.capturedAt.toISOString(),
    observedAt: (row.observedAt ?? row.snapshot.capturedAt).toISOString(),
    status: sourceStatus(row.status),
    errorMessage: row.errorMessage ?? undefined,
    details: (row.details as Record<string, unknown> | null) ?? undefined
  };
}

function sinceFor(range: HistoryRange): Date | undefined {
  if (range === 'all') return undefined;
  const duration = range === '24h' ? 24 * 60 * 60 * 1000 : range === '7d' ? 7 * 864e5 : 30 * 864e5;
  return new Date(Date.now() - duration);
}

export async function getTotalHistory(
  limit = 200,
  range: HistoryRange = '7d'
): Promise<SourceHistoryPoint[]> {
  const rows = await prisma.portfolioSnapshot.findMany({
    where: sinceFor(range) ? { capturedAt: { gte: sinceFor(range) } } : undefined,
    orderBy: { capturedAt: 'desc' },
    take: Math.max(1, Math.min(limit, 2000)),
    select: { capturedAt: true, totalRub: true }
  });

  return rows.reverse().map((row) => ({
    timestamp: row.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub)
  }));
}

export async function getSourceHistory(
  sourceId: PortfolioSourceId,
  limit = 200,
  range: HistoryRange = '7d'
): Promise<SourceHistoryPoint[]> {
  const since = sinceFor(range);
  const rows = await prisma.snapshotComponent.findMany({
    where: {
      sourceId,
      snapshot: since ? { capturedAt: { gte: since } } : undefined
    },
    orderBy: { snapshot: { capturedAt: 'desc' } },
    take: Math.max(1, Math.min(limit, 2000)),
    select: {
      totalRub: true,
      snapshot: { select: { capturedAt: true } }
    }
  });

  return rows.reverse().map((row) => ({
    timestamp: row.snapshot.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub)
  }));
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
