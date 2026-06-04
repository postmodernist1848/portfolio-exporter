import { getLatestSnapshot, getSourceHistory, getTotalHistory, saveSnapshot } from '@/lib/db/portfolio-repository';
import { collectLiveSnapshot } from '@/lib/sources';
import type { PortfolioSnapshot } from '@/types/portfolio';

export async function collectAndSaveSnapshot(): Promise<PortfolioSnapshot> {
  const snapshot = await collectLiveSnapshot();
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function getDashboardData(): Promise<{
  snapshot: PortfolioSnapshot;
  totalHistory: { timestamp: string; totalRub: number }[];
  sourceHistory: Record<string, { timestamp: string; totalRub: number }[]>;
}> {
  let snapshot: PortfolioSnapshot;

  try {
    snapshot = await collectLiveSnapshot({ useCache: true });
  } catch {
    const latestSnapshot = await getLatestSnapshot();
    if (!latestSnapshot) {
      snapshot = await collectAndSaveSnapshot();
    } else {
      snapshot = latestSnapshot;
    }
  }

  const totalHistory = await getTotalHistory();
  const sourceHistoryEntries = await Promise.all(
    snapshot.components.map(async (component) => [component.sourceId, await getSourceHistory(component.sourceId)] as const)
  );

  return {
    snapshot,
    totalHistory,
    sourceHistory: Object.fromEntries(sourceHistoryEntries)
  };
}
