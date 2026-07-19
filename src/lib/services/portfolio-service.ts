import {
  getLatestSnapshots,
  getSourceHistory,
  getTotalHistory,
  type HistoryRange
} from '@/lib/db/portfolio-repository';
import { SOURCE_METADATA } from '@/lib/sources/metadata';
import type {
  DashboardData,
  DashboardSnapshot,
  PortfolioSnapshot,
  PortfolioSourceId,
  SourceBreakdown,
  ValueChange
} from '@/types/portfolio';

function change(current: number, previous: number | undefined): ValueChange {
  if (previous === undefined) return null;
  return {
    absoluteRub: current - previous,
    percentage: previous === 0 ? null : ((current - previous) / previous) * 100
  };
}

function breakdownFor(
  sourceId: PortfolioSourceId,
  details: Record<string, unknown> | undefined
): SourceBreakdown | undefined {
  const expectedKind: Record<PortfolioSourceId, SourceBreakdown['kind']> = {
    crypto: 'crypto',
    tbank: 'tbank',
    bcs: 'bcs',
    okx: 'okx'
  };
  return details?.kind === expectedKind[sourceId] ? details as SourceBreakdown : undefined;
}

function toDashboardSnapshot(
  latest: PortfolioSnapshot,
  previous?: PortfolioSnapshot
): DashboardSnapshot {
  const staleByAge = Date.now() - Date.parse(latest.capturedAt) > 2 * 60 * 60 * 1000;
  const allDisabled = latest.components.length > 0 &&
    latest.components.every((component) => component.status === 'disabled');
  const previousBySource = new Map(previous?.components.map((item) => [item.sourceId, item]));
  return {
    capturedAt: latest.capturedAt,
    totalRub: latest.totalRub,
    status: latest.status,
    freshness: allDisabled ? 'not_configured' : staleByAge ? 'stale' : latest.status,
    freshSourceCount: latest.freshSourceCount,
    staleSourceCount: latest.staleSourceCount,
    errorSourceCount: latest.errorSourceCount,
    containsStaleValues: latest.components.some((item) => item.status === 'stale'),
    change: change(latest.totalRub, previous?.totalRub),
    components: latest.components
      .sort((a, b) => SOURCE_METADATA[a.sourceId].order - SOURCE_METADATA[b.sourceId].order)
      .map((component) => ({
        sourceId: component.sourceId,
        sourceName: SOURCE_METADATA[component.sourceId].name,
        totalRub: component.totalRub,
        observedAt: component.observedAt,
        status: component.status,
        message: component.errorMessage,
        infoMessage: SOURCE_METADATA[component.sourceId].infoMessage,
        breakdown: breakdownFor(component.sourceId, component.details),
        change: change(component.totalRub, previousBySource.get(component.sourceId)?.totalRub)
      }))
  };
}

export async function getDashboardData(range: HistoryRange = '7d'): Promise<DashboardData> {
  const [snapshots, totalHistory] = await Promise.all([
    getLatestSnapshots(2),
    getTotalHistory(2000, range)
  ]);
  const latest = snapshots[0];
  if (!latest) {
    return { snapshot: null, totalHistory: [], sourceHistory: {} };
  }

  const sourceHistory = Object.fromEntries(await Promise.all(
    latest.components.map(async (component) => [
      component.sourceId,
      await getSourceHistory(component.sourceId, 2000, range)
    ] as const)
  ));

  return {
    snapshot: toDashboardSnapshot(latest, snapshots[1]),
    totalHistory,
    sourceHistory
  };
}
