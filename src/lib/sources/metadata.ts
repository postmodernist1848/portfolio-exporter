import type { PortfolioSourceId } from '@/types/portfolio';

export const SOURCE_METADATA: Record<
  PortfolioSourceId,
  { name: string; color: string; order: number }
> = {
  crypto: { name: 'Крипто-портфель', color: '#2c6e62', order: 10 },
  bcs: { name: 'БКС Мир Инвестиций', color: '#3e7cb1', order: 20 },
  tbank: { name: 'Т Инвестиции', color: '#8a6d3b', order: 30 },
  okx: { name: 'OKX', color: '#6b46c1', order: 40 }
};

export const PORTFOLIO_SOURCE_IDS = Object.keys(SOURCE_METADATA) as PortfolioSourceId[];

export function isPortfolioSourceId(value: string): value is PortfolioSourceId {
  return value in SOURCE_METADATA;
}
