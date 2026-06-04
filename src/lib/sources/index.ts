import type { PortfolioSnapshot, SourceSnapshot } from '@/types/portfolio';
import { BcsSource } from './bcs';
import { CryptoSource } from './crypto';
import { TBankSource } from './tbank';
import type { PortfolioSource } from './types';

const registeredSources: PortfolioSource[] = [new CryptoSource(), new BcsSource(), new TBankSource()];
const COMPONENT_CACHE_TTL_MS = 60_000;

type ComponentCacheEntry = {
  snapshot: SourceSnapshot;
  expiresAt: number;
};

const componentCache = new Map<PortfolioSource['id'], ComponentCacheEntry>();
const componentInFlight = new Map<PortfolioSource['id'], Promise<SourceSnapshot>>();

export function getPortfolioSources(): PortfolioSource[] {
  return registeredSources;
}

function buildErrorSnapshot(source: PortfolioSource, capturedAt: string, error: unknown): SourceSnapshot {
  return {
    sourceId: source.id,
    sourceName: source.name,
    totalRub: 0,
    capturedAt,
    details: { error: error instanceof Error ? error.message : 'Unknown error' }
  };
}

function isCacheableSnapshot(snapshot: SourceSnapshot): boolean {
  return typeof snapshot.details?.error !== 'string' && typeof snapshot.details?.status !== 'string';
}

async function fetchSourceSnapshot(source: PortfolioSource, useCache: boolean): Promise<SourceSnapshot> {
  const now = Date.now();
  const cached = componentCache.get(source.id);
  if (useCache && cached && cached.expiresAt > now) {
    console.log('[sources] component cache hit', {
      sourceId: source.id,
      totalRub: cached.snapshot.totalRub
    });
    return cached.snapshot;
  }

  const existing = componentInFlight.get(source.id);
  if (useCache && existing) {
    console.log('[sources] component in-flight reused', { sourceId: source.id });
    return existing;
  }

  const request = source
    .fetchSnapshot()
    .then((snapshot) => {
      if (isCacheableSnapshot(snapshot)) {
        componentCache.set(source.id, {
          snapshot,
          expiresAt: Date.now() + COMPONENT_CACHE_TTL_MS
        });
      } else {
        componentCache.delete(source.id);
        console.warn('[sources] component not cached', {
          sourceId: source.id,
          details: snapshot.details
        });
      }
      return snapshot;
    })
    .finally(() => {
      componentInFlight.delete(source.id);
    });

  componentInFlight.set(source.id, request);
  return request;
}

export async function collectLiveSnapshot({ useCache = false }: { useCache?: boolean } = {}): Promise<PortfolioSnapshot> {
  const now = new Date().toISOString();

  const settled = await Promise.allSettled(registeredSources.map((source) => fetchSourceSnapshot(source, useCache)));

  const components: SourceSnapshot[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      console.log('[sources] component ok', {
        sourceId: result.value.sourceId,
        totalRub: result.value.totalRub
      });
      return result.value;
    }
    console.error('[sources] component failed', {
      sourceId: registeredSources[index].id,
      error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
    });

    return buildErrorSnapshot(registeredSources[index], now, result.reason);
  });

  const totalRubRaw = components.reduce((sum, component) => sum + component.totalRub, 0);
  const totalRub = Number.isFinite(totalRubRaw) ? totalRubRaw : 0;
  console.log('[sources] snapshot total', { totalRub });

  return {
    capturedAt: now,
    components,
    totalRub
  };
}
