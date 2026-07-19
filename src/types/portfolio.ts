export type PortfolioSourceId = 'crypto' | 'bcs' | 'tbank' | 'okx';
export type SourceStatus = 'ok' | 'partial' | 'stale' | 'disabled' | 'error';
export type SnapshotStatus = 'complete' | 'partial';

export type CryptoBreakdown = {
  kind: 'crypto';
  btc?: {
    priceRub: number;
    wallets: Array<{ address: string; balanceBtc: number; totalRub: number }>;
  };
  evm?: {
    usdRubRate: number;
    rateStale: boolean;
    wallets: Array<{
      address: string;
      totalUsd: number;
      totalRub: number;
      chains: Array<{ chain: string; totalUsd: number }>;
      unsupportedChains: string[];
      unavailableChains: string[];
    }>;
  };
  solana?: {
    solPriceRub: number;
    usdRubRate: number;
    rateStale: boolean;
    wallets: Array<{
      address: string;
      balanceSol: number;
      solRub: number;
      balanceUsdc: number;
      usdcRub: number;
      totalRub: number;
    }>;
  };
  hyperliquid?: {
    usdRubRate: number;
    rateStale: boolean;
    wallets: Array<{
      address: string;
      totalUsd: number;
      totalRub: number;
      accounts: Array<{
        address: string;
        name: string;
        mode: string;
        perpetualsUsd: number;
        spotUsd: number;
        vaultsUsd: number;
        stakingUsd: number;
        totalUsd: number;
        portfolioReportedAt: number;
        spotBalances: Array<{
          coin: string;
          balance: number;
          priceUsd: number | null;
          totalUsd: number | null;
        }>;
        unpricedCoins: string[];
      }>;
    }>;
  };
};

export type TBankBreakdown = {
  kind: 'tbank';
  accounts: Array<{
    name: string;
    type: string;
    totalRub: number | null;
    positionsCount: number;
    status: 'ok' | 'error';
    errorMessage?: string;
  }>;
  excludedAccounts: Array<{ name: string; reason: string }>;
};

export type BcsBreakdown = {
  kind: 'bcs';
  calculationMethod: string;
  accounts: Array<{
    account: string;
    totalRub: number;
    positions: Array<{
      ticker: string;
      name?: string;
      instrumentType?: string;
      quantity?: number;
      totalRub: number;
    }>;
  }>;
};

export type OkxBreakdown = {
  kind: 'okx';
  updatedAt?: string;
  categories: Array<{ name: string; totalRub: number }>;
};

export type SourceBreakdown =
  | CryptoBreakdown
  | TBankBreakdown
  | BcsBreakdown
  | OkxBreakdown;

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
  breakdown?: SourceBreakdown;
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
