import { z } from 'zod';
import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import type { CryptoBreakdown } from '@/types/portfolio';

const ALCHEMY_DATA_BASE_URL = 'https://api.g.alchemy.com/data/v1';
const MAX_ADDRESSES_PER_REQUEST = 2;
const NETWORKS = ['eth-mainnet', 'arb-mainnet'] as const;
const networkToChain = {
  'eth-mainnet': 'eth',
  'arb-mainnet': 'arbitrum'
} as const;

const tokenSchema = z.object({
  address: z.string(),
  network: z.enum(NETWORKS),
  tokenAddress: z.string().nullable(),
  tokenBalance: z.string().regex(/^0x[0-9a-f]+$/i),
  tokenMetadata: z.object({
    decimals: z.number().int().nonnegative(),
    logo: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    symbol: z.string().nullable().optional()
  }).nullable().optional(),
  tokenPrices: z.array(z.object({
    currency: z.string(),
    value: z.string(),
    lastUpdatedAt: z.string()
  })).nullable().optional(),
  error: z.string().nullable().optional()
});

const responseSchema = z.object({
  data: z.object({
    tokens: z.array(tokenSchema),
    pageKey: z.string().nullable().optional(),
    blockMetadata: z.record(z.string(), z.object({
      blockNumber: z.string(),
      blockHash: z.string(),
      blockTimestamp: z.string()
    }).nullable()).optional()
  }),
  error: z.object({
    message: z.string(),
    partialErrors: z.array(z.object({ network: z.string(), message: z.string() }))
  }).optional()
});

type AlchemyToken = z.infer<typeof tokenSchema>;
type EvmWallet = NonNullable<CryptoBreakdown['evm']>['wallets'][number];

export type AlchemyEvmResult = {
  totalUsd: number;
  incomplete: boolean;
  wallets: EvmWallet[];
};

export function buildAlchemyRequestBody(addresses: string[], pageKey?: string) {
  return {
    addresses: addresses.map((address) => ({ address, networks: [...NETWORKS] })),
    withMetadata: true,
    withPrices: true,
    includeNativeTokens: true,
    includeErc20Tokens: true,
    includeBlockMetadata: true,
    ...(pageKey ? { pageKey } : {})
  };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function finiteTokenValue(token: AlchemyToken): number | null {
  if (BigInt(token.tokenBalance) === 0n) return 0;
  if (token.error || !token.tokenMetadata) return null;
  const price = token.tokenPrices?.find((item) => item.currency.toLowerCase() === 'usd');
  if (!price) return null;
  const priceUsd = Number(price.value);
  const balance = Number(BigInt(token.tokenBalance)) / 10 ** token.tokenMetadata.decimals;
  const value = balance * priceUsd;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function fetchChunk(addresses: string[]) {
  if (!env.ALCHEMY_API_KEY) throw new Error('EVM provider is not configured');
  const tokens: AlchemyToken[] = [];
  const failedNetworks = new Set<string>();
  const successfulNetworks = new Set<string>();
  let pageKey: string | undefined;

  do {
    const response = await getJson(
      `${ALCHEMY_DATA_BASE_URL}/${encodeURIComponent(env.ALCHEMY_API_KEY)}/assets/tokens/by-address`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAlchemyRequestBody(addresses, pageKey))
      },
      responseSchema,
      { provider: 'alchemy', operation: 'evm-token-balances' }
    );
    tokens.push(...response.data.tokens);
    response.error?.partialErrors.forEach((item) => failedNetworks.add(item.network));
    Object.entries(response.data.blockMetadata ?? {}).forEach(([network, metadata]) => {
      if (metadata) successfulNetworks.add(network);
    });
    pageKey = response.data.pageKey ?? undefined;
  } while (pageKey);

  NETWORKS.forEach((network) => {
    if (!failedNetworks.has(network)) successfulNetworks.add(network);
  });
  return { addresses, tokens, failedNetworks, successfulNetworks };
}

export async function fetchAlchemyEvmWallets(addresses: string[]): Promise<AlchemyEvmResult> {
  const results = await Promise.all(chunks(addresses, MAX_ADDRESSES_PER_REQUEST).map(fetchChunk));
  const wallets: EvmWallet[] = [];
  let incomplete = false;
  let successfulNetworkCount = 0;

  for (const result of results) {
    incomplete ||= result.failedNetworks.size > 0;
    successfulNetworkCount += result.successfulNetworks.size;
    for (const address of result.addresses) {
      const addressTokens = result.tokens.filter(
        (token) => token.address.toLowerCase() === address.toLowerCase()
      );
      let excludedAssetCount = 0;
      const chains = NETWORKS.map((network) => {
        const totalUsd = addressTokens
          .filter((token) => token.network === network)
          .reduce((sum, token) => {
            const value = finiteTokenValue(token);
            if (value === null) {
              excludedAssetCount += 1;
              if (token.error) incomplete = true;
              return sum;
            }
            return sum + value;
          }, 0);
        return { chain: networkToChain[network], totalUsd };
      });
      const totalUsd = chains.reduce((sum, chain) => sum + chain.totalUsd, 0);
      wallets.push({
        address,
        totalUsd,
        totalRub: 0,
        chains,
        unsupportedChains: [],
        unavailableChains: NETWORKS
          .filter((network) => result.failedNetworks.has(network))
          .map((network) => networkToChain[network]),
        excludedAssetCount
      });
    }
  }

  if (successfulNetworkCount === 0) throw new Error('All configured EVM networks failed');
  return {
    totalUsd: wallets.reduce((sum, wallet) => sum + wallet.totalUsd, 0),
    incomplete,
    wallets
  };
}
