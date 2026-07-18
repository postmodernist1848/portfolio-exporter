import type { PortfolioSourceId, SourceStatus } from '@/types/portfolio';

type SourceResultBase = {
  sourceId: PortfolioSourceId;
  sourceName: string;
  totalRub: number;
  observedAt: string;
  details?: Record<string, unknown>;
};

export type SourceCollectionResult =
  | (SourceResultBase & { status: 'ok' })
  | (SourceResultBase & { status: 'partial'; errorMessage: string })
  | (Omit<SourceResultBase, 'observedAt'> & {
      status: 'disabled';
      observedAt?: string;
      errorMessage?: string;
    });

export interface PortfolioSource {
  id: PortfolioSourceId;
  name: string;
  fetchSnapshot(): Promise<SourceCollectionResult>;
}
