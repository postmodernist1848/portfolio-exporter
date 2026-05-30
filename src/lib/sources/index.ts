import type { PortfolioSnapshot, SourceSnapshot } from '@/types/portfolio';
import { BcsSource } from './bcs';
import { CryptoSource } from './crypto';
import { TBankSource } from './tbank';
import type { PortfolioSource } from './types';

const registeredSources: PortfolioSource[] = [new CryptoSource(), new BcsSource(), new TBankSource()];

export function getPortfolioSources(): PortfolioSource[] {
  return registeredSources;
}

export async function collectLiveSnapshot(): Promise<PortfolioSnapshot> {
  const now = new Date().toISOString();

  const settled = await Promise.allSettled(registeredSources.map((source) => source.fetchSnapshot()));

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

    return {
      sourceId: registeredSources[index].id,
      sourceName: registeredSources[index].name,
      totalRub: 0,
      capturedAt: now,
      details: { error: result.reason instanceof Error ? result.reason.message : 'Unknown error' }
    };
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
