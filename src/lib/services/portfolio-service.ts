import { getLatestSnapshot, getSourceHistory, getTotalHistory, saveSnapshot } from '@/lib/db/portfolio-repository';
import { collectLiveSnapshot } from '@/lib/sources';
import type { PortfolioSnapshot } from '@/types/portfolio';

const LIVE_CACHE_TTL_MS = 60_000;

let liveCache: { snapshot: PortfolioSnapshot; expiresAt: number } | null = null;
let liveInFlight: Promise<PortfolioSnapshot> | null = null;

export async function collectAndSaveSnapshot(): Promise<PortfolioSnapshot> {
  const snapshot = await collectLiveSnapshot();
  await saveSnapshot(snapshot);
  liveCache = {
    snapshot,
    expiresAt: Date.now() + LIVE_CACHE_TTL_MS
  };
  return snapshot;
}

async function getLiveSnapshotCached(): Promise<PortfolioSnapshot> {
  const now = Date.now();
  if (liveCache && liveCache.expiresAt > now) {
    return liveCache.snapshot;
  }

  if (liveInFlight) {
    return liveInFlight;
  }

  liveInFlight = collectLiveSnapshot()
    .then((snapshot) => {
      liveCache = {
        snapshot,
        expiresAt: Date.now() + LIVE_CACHE_TTL_MS
      };
      return snapshot;
    })
    .finally(() => {
      liveInFlight = null;
    });

  return liveInFlight;
}

export async function getDashboardData(): Promise<{
  snapshot: PortfolioSnapshot;
  totalHistory: { timestamp: string; totalRub: number }[];
  sourceHistory: Record<string, { timestamp: string; totalRub: number }[]>;
}> {
  let snapshot: PortfolioSnapshot;

  try {
    snapshot = await getLiveSnapshotCached();
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
