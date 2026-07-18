import {
  getLatestSnapshot,
  getLatestSuccessfulComponent,
  saveSnapshot
} from '@/lib/db/portfolio-repository';
import { getPortfolioSources } from '@/lib/sources';
import type { PortfolioSnapshot, SourceSnapshot } from '@/types/portfolio';

const PUBLIC_COOLDOWN_MS = 60_000;
let inFlight: Promise<PortfolioSnapshot> | null = null;
let lastCompletedAt = 0;

export type CollectionResponse = {
  state: 'completed' | 'in_progress' | 'cooldown';
  snapshot: PortfolioSnapshot | null;
};

function publicMessage(status: SourceSnapshot['status']): string | undefined {
  if (status === 'stale') return 'Показано последнее успешно полученное значение';
  if (status === 'error') return 'Источник временно недоступен';
  if (status === 'partial') return 'Часть данных источника временно недоступна';
  return undefined;
}

async function performCollection(): Promise<PortfolioSnapshot> {
  const capturedAt = new Date().toISOString();
  const sources = getPortfolioSources();
  const settled = await Promise.allSettled(sources.map((source) => source.fetchSnapshot()));
  const components = await Promise.all(settled.map(async (result, index): Promise<SourceSnapshot> => {
    const source = sources[index];
    if (result.status === 'fulfilled') {
      const value = result.value;
      return {
        sourceId: value.sourceId,
        sourceName: value.sourceName,
        totalRub: value.totalRub,
        capturedAt,
        observedAt: value.observedAt ?? capturedAt,
        status: value.status,
        errorMessage: publicMessage(value.status),
        details: value.details
      };
    }

    console.error('[collection] source failed', {
      sourceId: source.id,
      error: result.reason instanceof Error ? result.reason.message : 'Unknown failure'
    });
    const previous = await getLatestSuccessfulComponent(source.id);
    if (previous) {
      return {
        ...previous,
        capturedAt,
        status: 'stale',
        errorMessage: publicMessage('stale')
      };
    }
    return {
      sourceId: source.id,
      sourceName: source.name,
      totalRub: 0,
      capturedAt,
      observedAt: capturedAt,
      status: 'error',
      errorMessage: publicMessage('error')
    };
  }));

  const enabled = components.filter((component) => component.status !== 'disabled');
  const staleSourceCount = enabled.filter((component) => component.status === 'stale').length;
  const errorSourceCount = enabled.filter((component) => component.status === 'error').length;
  const freshSourceCount = enabled.filter(
    (component) => component.status === 'ok' || component.status === 'partial'
  ).length;
  const status = enabled.some((component) => component.status !== 'ok') ? 'partial' : 'complete';
  const snapshot: PortfolioSnapshot = {
    capturedAt,
    totalRub: components.reduce((sum, component) => sum + component.totalRub, 0),
    status,
    freshSourceCount,
    staleSourceCount,
    errorSourceCount,
    components
  };
  await saveSnapshot(snapshot);
  return snapshot;
}

function startCollection(): Promise<PortfolioSnapshot> {
  if (inFlight) return inFlight;
  inFlight = performCollection().finally(() => {
    lastCompletedAt = Date.now();
    inFlight = null;
  });
  return inFlight;
}

export async function requestPublicCollection(): Promise<CollectionResponse> {
  if (inFlight) {
    return { state: 'in_progress', snapshot: await getLatestSnapshot() };
  }
  if (Date.now() - lastCompletedAt < PUBLIC_COOLDOWN_MS) {
    return { state: 'cooldown', snapshot: await getLatestSnapshot() };
  }
  const snapshot = await startCollection();
  return { state: 'completed', snapshot };
}

export async function runScheduledCollection(): Promise<PortfolioSnapshot> {
  return startCollection();
}

export function isCollectionInProgress(): boolean {
  return inFlight !== null;
}
