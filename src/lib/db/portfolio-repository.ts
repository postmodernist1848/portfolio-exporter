import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import type { PortfolioSnapshot, SourceHistoryPoint } from '@/types/portfolio';

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

function toPrismaJson(
  value: Record<string, unknown> | undefined
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (!value) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

export async function saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
  await prisma.portfolioSnapshot.upsert({
    where: { capturedAt: new Date(snapshot.capturedAt) },
    update: {
      totalRub: snapshot.totalRub,
      components: {
        deleteMany: {},
        create: snapshot.components.map((component) => ({
          sourceId: component.sourceId,
          sourceName: component.sourceName,
          totalRub: component.totalRub,
          details: toPrismaJson(component.details)
        }))
      }
    },
    create: {
      capturedAt: new Date(snapshot.capturedAt),
      totalRub: snapshot.totalRub,
      components: {
        create: snapshot.components.map((component) => ({
          sourceId: component.sourceId,
          sourceName: component.sourceName,
          totalRub: component.totalRub,
          details: toPrismaJson(component.details)
        }))
      }
    }
  });
}

export async function getLatestSnapshot(): Promise<PortfolioSnapshot | null> {
  const row = await prisma.portfolioSnapshot.findFirst({
    orderBy: { capturedAt: 'desc' },
    include: { components: true }
  });

  if (!row) {
    return null;
  }

  return {
    capturedAt: row.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub),
    components: row.components.map((component) => ({
      sourceId: component.sourceId as 'crypto' | 'bcs' | 'tbank',
      sourceName: component.sourceName,
      totalRub: decimalToNumber(component.totalRub),
      capturedAt: row.capturedAt.toISOString(),
      details: (component.details as Record<string, unknown> | null) ?? undefined
    }))
  };
}

export async function getTotalHistory(limit = 200): Promise<SourceHistoryPoint[]> {
  const rows = await prisma.portfolioSnapshot.findMany({
    orderBy: { capturedAt: 'asc' },
    take: limit,
    select: { capturedAt: true, totalRub: true }
  });

  return rows.map((row) => ({
    timestamp: row.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub)
  }));
}

export async function getSourceHistory(sourceId: string, limit = 200): Promise<SourceHistoryPoint[]> {
  const rows = await prisma.snapshotComponent.findMany({
    where: { sourceId },
    orderBy: { snapshot: { capturedAt: 'asc' } },
    take: limit,
    select: {
      totalRub: true,
      snapshot: {
        select: {
          capturedAt: true
        }
      }
    }
  });

  return rows.map((row) => ({
    timestamp: row.snapshot.capturedAt.toISOString(),
    totalRub: decimalToNumber(row.totalRub)
  }));
}
