import {
  getLatestSnapshot,
  getLatestSuccessfulComponent
} from '@/lib/db/portfolio-repository';
import { getPortfolioSources } from '@/lib/sources';
import { collectWithDatabaseLock } from '@/lib/db/collection-lock';
import { withCollectionDeadline } from './http';
import type { PortfolioSnapshot, SourceSnapshot } from '@/types/portfolio';

let inFlight: Promise<CollectionResponse> | null = null;

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
  return {
    capturedAt,
    totalRub: components.reduce((sum, component) => sum + component.totalRub, 0),
    status,
    freshSourceCount,
    staleSourceCount,
    errorSourceCount,
    components
  };
}

function startCollection(): Promise<CollectionResponse> {
  if (inFlight) return inFlight;
  inFlight = collectWithDatabaseLock(() => withCollectionDeadline(performCollection)).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function requestPublicCollection(): Promise<CollectionResponse> {
  if (inFlight) {
    return { state: 'in_progress', snapshot: await getLatestSnapshot() };
  }
  const result = await startCollection();
  return { ...result, snapshot: result.snapshot ?? await getLatestSnapshot() };
}

export async function runScheduledCollection(): Promise<PortfolioSnapshot | null> {
  return (await startCollection()).snapshot;
}
