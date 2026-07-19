import { z } from 'zod';
import { getJson } from '@/lib/services/http';
import { fetchUsdRubRate } from './currency';
import type { CryptoBreakdown } from '@/types/portfolio';

const INFO_URL = 'https://api.hyperliquid.xyz/info';
const decimal = z.union([z.string(), z.number()])
  .transform(Number)
  .pipe(z.number().finite());

const abstractionSchema = z.enum([
  'unifiedAccount',
  'portfolioMargin',
  'disabled',
  'default',
  'dexAbstraction'
]);
const clearinghouseSchema = z.object({
  marginSummary: z.object({ accountValue: decimal })
}).passthrough();
const spotStateSchema = z.object({
  balances: z.array(z.object({
    coin: z.string(),
    token: z.number().int().nonnegative(),
    total: decimal
  }).passthrough())
});
const spotMetaAndContextsSchema = z.tuple([
  z.object({
    tokens: z.array(z.object({
      name: z.string(),
      index: z.number().int().nonnegative()
    }).passthrough()),
    universe: z.array(z.object({
      name: z.string(),
      tokens: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
      index: z.number().int().nonnegative()
    }).passthrough())
  }),
  z.array(z.object({
    markPx: decimal.optional(),
    midPx: decimal.nullable().optional()
  }).passthrough())
]);
const vaultEquitiesSchema = z.array(z.object({
  vaultAddress: z.string(),
  equity: decimal
}));
const subAccountsSchema = z.array(z.object({
  name: z.string(),
  subAccountUser: z.string()
})).nullable().transform((value) => value ?? []);
const delegatorSummarySchema = z.object({
  delegated: decimal.optional().default(0),
  undelegated: decimal.optional().default(0),
  totalPendingWithdrawal: decimal.optional().default(0)
}).passthrough();
const portfolioSchema = z.array(z.tuple([
  z.string(),
  z.object({
    accountValueHistory: z.array(z.tuple([
      z.number().int().nonnegative(),
      decimal
    ]))
  }).passthrough()
]));

type SpotMarket = {
  tokens: [number, number];
  priceUsd: number | null;
};

export function hyperliquidInfoBody(type: string, user?: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...(user ? { user } : {}) })
  };
}

async function info<S extends z.ZodTypeAny>(
  type: string,
  schema: S,
  user?: string
): Promise<z.output<S>> {
  return getJson(
    INFO_URL,
    hyperliquidInfoBody(type, user),
    schema as z.ZodType<z.output<S>>,
    { provider: 'hyperliquid', operation: type }
  );
}

function buildSpotMarkets(
  response: z.infer<typeof spotMetaAndContextsSchema>
): Map<number, SpotMarket> {
  const [meta, contexts] = response;
  return new Map(meta.universe.map((market, index) => [
    market.tokens[0],
    {
      tokens: market.tokens,
      priceUsd: contexts[index]?.midPx ?? contexts[index]?.markPx ?? null
    }
  ]));
}

function spotPriceUsd(token: number, markets: Map<number, SpotMarket>): number | null {
  if (token === 0) return 1;
  const market = markets.get(token);
  return market?.tokens[1] === 0 ? market.priceUsd : null;
}

async function fetchAccount(
  address: string,
  name: string,
  markets: Map<number, SpotMarket>,
  hypeTokenIndex: number | undefined
) {
  const [mode, clearinghouse, spot, vaults, staking, portfolio] = await Promise.all([
    info('userAbstraction', abstractionSchema, address),
    info('clearinghouseState', clearinghouseSchema, address),
    info('spotClearinghouseState', spotStateSchema, address),
    info('userVaultEquities', vaultEquitiesSchema, address),
    info('delegatorSummary', delegatorSummarySchema, address),
    info('portfolio', portfolioSchema, address)
  ]);
  const spotBalances = spot.balances.map((balance) => {
    const priceUsd = spotPriceUsd(balance.token, markets);
    return {
      coin: balance.coin,
      balance: balance.total,
      priceUsd,
      totalUsd: priceUsd === null ? null : balance.total * priceUsd
    };
  });
  const spotUsd = spotBalances.reduce((sum, balance) => sum + (balance.totalUsd ?? 0), 0);
  const unified = mode === 'unifiedAccount' || mode === 'portfolioMargin';
  const perpetualsUsd = unified ? 0 : clearinghouse.marginSummary.accountValue;
  const vaultsUsd = vaults.reduce((sum, vault) => sum + vault.equity, 0);
  const hypePrice = hypeTokenIndex === undefined ? null : spotPriceUsd(hypeTokenIndex, markets);
  const stakedHype = staking.delegated + staking.undelegated + staking.totalPendingWithdrawal;
  const stakingUsd = hypePrice === null ? 0 : stakedHype * hypePrice;
  const unpricedCoins = spotBalances
    .filter((balance) => balance.balance !== 0 && balance.priceUsd === null)
    .map((balance) => balance.coin);
  if (stakedHype !== 0 && hypePrice === null) unpricedCoins.push('staked HYPE');
  const portfolioSeries = portfolio.find(([period]) => period === 'day')
    ?? portfolio.find(([period]) => period === 'allTime');
  const latestPortfolioValue = portfolioSeries?.[1].accountValueHistory.at(-1);
  if (!latestPortfolioValue) {
    throw new Error('Hyperliquid portfolio response has no account value');
  }

  return {
    address,
    name,
    mode,
    perpetualsUsd,
    spotUsd,
    vaultsUsd,
    stakingUsd,
    totalUsd: latestPortfolioValue[1],
    portfolioReportedAt: latestPortfolioValue[0],
    spotBalances,
    unpricedCoins
  };
}

export async function fetchHyperliquidBreakdown(
  wallets: string[],
  ratePromise: ReturnType<typeof fetchUsdRubRate>
): Promise<{
  totalRub: number;
  staleRate: boolean;
  incomplete: boolean;
  breakdown: NonNullable<CryptoBreakdown['hyperliquid']>;
}> {
  const [spotMetadata, rate] = await Promise.all([
    info('spotMetaAndAssetCtxs', spotMetaAndContextsSchema),
    ratePromise
  ]);
  const [meta] = spotMetadata;
  const markets = buildSpotMarkets(spotMetadata);
  const hypeTokenIndex = meta.tokens.find((token) => token.name === 'HYPE')?.index;

  const rows = await Promise.all(wallets.map(async (address) => {
    const subAccounts = await info('subAccounts', subAccountsSchema, address);
    const accounts = await Promise.all([
      fetchAccount(address, 'Основной аккаунт', markets, hypeTokenIndex),
      ...subAccounts.map((subAccount) => fetchAccount(
        subAccount.subAccountUser,
        subAccount.name,
        markets,
        hypeTokenIndex
      ))
    ]);
    const totalUsd = accounts.reduce((sum, account) => sum + account.totalUsd, 0);
    return { address, accounts, totalUsd, totalRub: totalUsd * rate.rate };
  }));

  return {
    totalRub: rows.reduce((sum, row) => sum + row.totalRub, 0),
    staleRate: rate.stale,
    incomplete: false,
    breakdown: {
      usdRubRate: rate.rate,
      rateStale: rate.stale,
      wallets: rows
    }
  };
}
