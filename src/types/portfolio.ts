export type PortfolioSourceId = 'crypto' | 'bcs' | 'tbank' | 'okx';
export type SourceStatus = 'ok' | 'partial' | 'stale' | 'disabled' | 'error';
export type SnapshotStatus = 'complete' | 'partial';

export type SourceSnapshot = {
  sourceId: PortfolioSourceId;
  sourceName: string;
  totalRub: number;
  capturedAt: string;
  observedAt: string;
  status: SourceStatus;
  errorMessage?: string;
  details?: Record<string, unknown>;
};

export type PortfolioSnapshot = {
  capturedAt: string;
  totalRub: number;
  status: SnapshotStatus;
  freshSourceCount: number;
  staleSourceCount: number;
  errorSourceCount: number;
  components: SourceSnapshot[];
};

export type SourceHistoryPoint = {
  timestamp: string;
  totalRub: number;
};

export type ValueChange = {
  absoluteRub: number;
  percentage: number | null;
} | null;

export type DashboardSource = Omit<SourceSnapshot, 'details' | 'capturedAt' | 'errorMessage'> & {
  message?: string;
  infoMessage?: string;
  change: ValueChange;
};

export type DashboardSnapshot = {
  capturedAt: string;
  totalRub: number;
  status: SnapshotStatus;
  freshness: 'complete' | 'partial' | 'stale' | 'not_configured';
  freshSourceCount: number;
  staleSourceCount: number;
  errorSourceCount: number;
  containsStaleValues: boolean;
  change: ValueChange;
  components: DashboardSource[];
};

export type DashboardData = {
  snapshot: DashboardSnapshot | null;
  totalHistory: SourceHistoryPoint[];
  sourceHistory: Partial<Record<PortfolioSourceId, SourceHistoryPoint[]>>;
};
