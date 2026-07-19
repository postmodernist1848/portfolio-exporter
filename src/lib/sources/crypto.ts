import { z } from 'zod';
import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import { fetchCryptoMarketPrices } from './currency';
import { fetchHyperliquidBreakdown } from './hyperliquid';
import type { PortfolioSource, SourceCollectionResult } from './types';
import type { CryptoBreakdown } from '@/types/portfolio';

const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const MORALIS_EVM_CHAINS = ['eth', 'arbitrum'] as const;

const btcSchema = z.object({
  chain_stats: z.object({
    funded_txo_sum: z.number(),
    spent_txo_sum: z.number()
  })
});
const solBalanceSchema = z.object({
  result: z.object({ value: z.number().nonnegative() }),
  error: z.never().optional()
});
const solTokensSchema = z.object({
  result: z.object({
    value: z.array(z.object({
      account: z.object({
        data: z.object({
          parsed: z.object({
            info: z.object({
              tokenAmount: z.object({
                amount: z.string().regex(/^\d+$/),
                decimals: z.number().int().nonnegative()
              })
            })
          })
        })
      })
    }))
  }),
  error: z.never().optional()
});
const moralisSchema = z.object({
  total_networth_usd: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().finite()),
  chains: z.array(z.object({
    chain: z.string(),
    networth_usd: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().finite())
  })),
  unsupported_chain_ids: z.array(z.string()).optional().default([]),
  unavailable_chains: z.array(z.object({ chain_id: z.string() })).optional().default([])
});

function addresses(raw?: string): string[] {
  return raw?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
}

export function buildMoralisNetWorthUrl(address: string): string {
  const url = new URL(
    `https://deep-index.moralis.io/api/v2.2/wallets/${encodeURIComponent(address)}/net-worth`
  );
  MORALIS_EVM_CHAINS.forEach((chain, index) => {
    url.searchParams.set(`chains[${index}]`, chain);
  });
  url.searchParams.set('exclude_spam', 'true');
  url.searchParams.set('exclude_unverified_contracts', 'true');
  return url.toString();
}

async function fetchBtcBreakdown(
  wallets: string[],
  pricesPromise: ReturnType<typeof fetchCryptoMarketPrices>
): Promise<{ totalRub: number; breakdown: NonNullable<CryptoBreakdown['btc']> }> {
  const [balances, prices] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      `https://blockstream.info/api/address/${encodeURIComponent(address)}`,
      undefined,
      btcSchema,
      { provider: 'blockstream', operation: 'btc-balance' }
    ))),
    pricesPromise
  ]);
  const rows = balances.map((value, index) => {
    const balanceBtc = (value.chain_stats.funded_txo_sum - value.chain_stats.spent_txo_sum) / 1e8;
    return {
      address: wallets[index],
      balanceBtc,
      totalRub: balanceBtc * prices.bitcoinRub
    };
  });
  return {
    totalRub: rows.reduce((sum, row) => sum + row.totalRub, 0),
    breakdown: { priceRub: prices.bitcoinRub, wallets: rows }
  };
}

function rpcBody(method: string, params: unknown[]) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  };
}

async function fetchSolanaBreakdown(
  wallets: string[],
  pricesPromise: ReturnType<typeof fetchCryptoMarketPrices>
): Promise<{
  totalRub: number;
  staleRate: boolean;
  breakdown: NonNullable<CryptoBreakdown['solana']>;
}> {
  const [balances, tokenResponses, prices] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL,
      rpcBody('getBalance', [address]),
      solBalanceSchema,
      { provider: 'solana', operation: 'native-balance' }
    ))),
    Promise.all(wallets.map((address) => getJson(
      env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL,
      rpcBody('getTokenAccountsByOwner', [
        address,
        { mint: SOLANA_USDC_MINT },
        { encoding: 'jsonParsed' }
      ]),
      solTokensSchema,
      { provider: 'solana', operation: 'usdc-balances' }
    ))),
    pricesPromise
  ]);
  const rows = wallets.map((address, index) => {
    const balanceSol = balances[index].result.value / 1e9;
    const balanceUsdc = tokenResponses[index].result.value.reduce((sum, item) => {
      const token = item.account.data.parsed.info.tokenAmount;
      return sum + Number(token.amount) / 10 ** token.decimals;
    }, 0);
    const solRub = balanceSol * prices.solanaRub;
    const usdcRub = balanceUsdc * prices.usdRubRate;
    return {
      address,
      balanceSol,
      solRub,
      balanceUsdc,
      usdcRub,
      totalRub: solRub + usdcRub
    };
  });
  return {
    totalRub: rows.reduce((sum, row) => sum + row.totalRub, 0),
    staleRate: prices.stale,
    breakdown: {
      solPriceRub: prices.solanaRub,
      usdRubRate: prices.usdRubRate,
      rateStale: prices.stale,
      wallets: rows
    }
  };
}

async function fetchEvmBreakdown(
  wallets: string[],
  pricesPromise: ReturnType<typeof fetchCryptoMarketPrices>
): Promise<{
  totalRub: number;
  staleRate: boolean;
  breakdown: NonNullable<CryptoBreakdown['evm']>;
}> {
  if (!env.MORALIS_API_KEY) throw new Error('EVM provider is not configured');
  const [values, prices] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      buildMoralisNetWorthUrl(address),
      { headers: { 'X-API-Key': env.MORALIS_API_KEY! } },
      moralisSchema,
      { provider: 'moralis', operation: 'evm-net-worth' }
    ))),
    pricesPromise
  ]);
  const rows = values.map((value, index) => {
    const totalUsd = Number(value.total_networth_usd);
    return {
      address: wallets[index],
      totalUsd,
      totalRub: totalUsd * prices.usdRubRate,
      chains: value.chains.map((chain) => ({
        chain: chain.chain,
        totalUsd: Number(chain.networth_usd)
      })),
      unsupportedChains: value.unsupported_chain_ids ?? [],
      unavailableChains: (value.unavailable_chains ?? []).map((chain) => chain.chain_id)
    };
  });
  return {
    totalRub: rows.reduce((sum, row) => sum + row.totalRub, 0),
    staleRate: prices.stale,
    breakdown: {
      usdRubRate: prices.usdRubRate,
      rateStale: prices.stale,
      wallets: rows
    }
  };
}

export class CryptoSource implements PortfolioSource {
  id = 'crypto' as const;
  name = 'Крипто-портфель';

  async fetchSnapshot(): Promise<SourceCollectionResult> {
    const observedAt = new Date().toISOString();
    const btc = addresses(env.BTC_ADDRESSES);
    const evm = addresses(env.EVM_ADDRESSES);
    const sol = addresses(env.SOL_ADDRESSES);
    const hyperliquid = addresses(env.HYPERLIQUID_ADDRESSES);
    const configured = Number(Boolean(btc.length)) + Number(Boolean(evm.length))
      + Number(Boolean(sol.length)) + Number(Boolean(hyperliquid.length));
    if (!configured) {
      return { sourceId: this.id, sourceName: this.name, totalRub: 0, status: 'disabled' };
    }

    const pricesPromise = fetchCryptoMarketPrices();
    const tasks: Array<{
      key: 'btc' | 'evm' | 'solana' | 'hyperliquid';
      promise: Promise<{
        totalRub: number;
        staleRate?: boolean;
        incomplete?: boolean;
        breakdown: NonNullable<
          CryptoBreakdown['btc']
          | CryptoBreakdown['evm']
          | CryptoBreakdown['solana']
          | CryptoBreakdown['hyperliquid']
        >;
      }>;
    }> = [];
    if (btc.length && pricesPromise) {
      tasks.push({ key: 'btc', promise: fetchBtcBreakdown(btc, pricesPromise) });
    }
    if (evm.length) {
      tasks.push({ key: 'evm', promise: fetchEvmBreakdown(evm, pricesPromise) });
    }
    if (sol.length) {
      tasks.push({ key: 'solana', promise: fetchSolanaBreakdown(sol, pricesPromise) });
    }
    if (hyperliquid.length) {
      tasks.push({
        key: 'hyperliquid',
        promise: fetchHyperliquidBreakdown(hyperliquid, pricesPromise)
      });
    }
    const settled = await Promise.allSettled(tasks.map((task) => task.promise));
    const succeeded = settled.filter((item) => item.status === 'fulfilled');
    if (!succeeded.length) throw new Error('All configured crypto components failed');

    const totalRub = succeeded.reduce((sum, item) => sum + item.value.totalRub, 0);
    const hasStaleRate = succeeded.some(
      (item) => item.value.staleRate
    );
    const incomplete = succeeded.some((item) => item.value.incomplete);
    const partial = succeeded.length !== settled.length || hasStaleRate || incomplete;
    const breakdown: CryptoBreakdown = { kind: 'crypto' };
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const key = tasks[index].key;
      if (key === 'btc') breakdown.btc = result.value.breakdown as NonNullable<CryptoBreakdown['btc']>;
      if (key === 'evm') breakdown.evm = result.value.breakdown as NonNullable<CryptoBreakdown['evm']>;
      if (key === 'solana') {
        breakdown.solana = result.value.breakdown as NonNullable<CryptoBreakdown['solana']>;
      }
      if (key === 'hyperliquid') {
        breakdown.hyperliquid = result.value.breakdown as NonNullable<CryptoBreakdown['hyperliquid']>;
      }
    });
    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      observedAt,
      status: partial ? 'partial' : 'ok',
      ...(partial ? { errorMessage: 'Часть крипто-данных временно недоступна' } : {}),
      details: breakdown as unknown as Record<string, unknown>
    } as SourceCollectionResult;
  }
}
