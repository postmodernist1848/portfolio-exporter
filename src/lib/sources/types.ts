import type { SourceSnapshot } from '@/types/portfolio';

export interface PortfolioSource {
  id: SourceSnapshot['sourceId'];
  name: string;
  fetchSnapshot(): Promise<SourceSnapshot>;
}
