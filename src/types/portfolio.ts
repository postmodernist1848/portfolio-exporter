export type PortfolioSourceId = 'crypto' | 'bcs' | 'tbank';

export type SourceSnapshot = {
  sourceId: PortfolioSourceId;
  sourceName: string;
  totalRub: number;
  capturedAt: string;
  details?: Record<string, unknown>;
};

export type PortfolioSnapshot = {
  capturedAt: string;
  totalRub: number;
  components: SourceSnapshot[];
};

export type SourceHistoryPoint = {
  timestamp: string;
  totalRub: number;
};
