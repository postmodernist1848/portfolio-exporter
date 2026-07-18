import { z } from 'zod';
import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import { fetchUsdRubRate } from './currency';
import type { PortfolioSource, SourceCollectionResult } from './types';

const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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
const pricesSchema = z.object({
  bitcoin: z.object({ rub: z.number().nonnegative() }),
  solana: z.object({ rub: z.number().nonnegative() })
});
const moralisSchema = z.object({
  total_networth_usd: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().finite())
});

function addresses(raw?: string): string[] {
  return raw?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
}

async function fetchBtcRub(wallets: string[]): Promise<number> {
  if (!wallets.length) return 0;
  const [balances, prices] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      `https://blockstream.info/api/address/${encodeURIComponent(address)}`,
      undefined,
      btcSchema,
      { provider: 'blockstream', operation: 'btc-balance' }
    ))),
    fetchPrices()
  ]);
  const btc = balances.reduce(
    (sum, value) => sum + (value.chain_stats.funded_txo_sum - value.chain_stats.spent_txo_sum) / 1e8,
    0
  );
  return btc * prices.bitcoin.rub;
}

async function fetchPrices() {
  return getJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=rub',
    undefined,
    pricesSchema,
    { provider: 'coingecko', operation: 'rub-prices' }
  );
}

function rpcBody(method: string, params: unknown[]) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  };
}

async function fetchSolRub(wallets: string[]): Promise<number> {
  if (!wallets.length) return 0;
  const [balances, prices] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL,
      rpcBody('getBalance', [address]),
      solBalanceSchema,
      { provider: 'solana', operation: 'native-balance' }
    ))),
    fetchPrices()
  ]);
  return balances.reduce((sum, item) => sum + item.result.value / 1e9, 0) * prices.solana.rub;
}

async function fetchSolUsdcRub(wallets: string[]): Promise<{ totalRub: number; staleRate: boolean }> {
  if (!wallets.length) return { totalRub: 0, staleRate: false };
  const [responses, rate] = await Promise.all([
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
    fetchUsdRubRate()
  ]);
  const usdc = responses.flatMap((item) => item.result.value).reduce((sum, item) => {
    const token = item.account.data.parsed.info.tokenAmount;
    return sum + Number(token.amount) / 10 ** token.decimals;
  }, 0);
  return { totalRub: usdc * rate.rate, staleRate: rate.stale };
}

async function fetchEvmRub(wallets: string[]): Promise<{ totalRub: number; staleRate: boolean }> {
  if (!wallets.length) return { totalRub: 0, staleRate: false };
  if (!env.MORALIS_API_KEY) throw new Error('EVM provider is not configured');
  const [values, rate] = await Promise.all([
    Promise.all(wallets.map((address) => getJson(
      `https://deep-index.moralis.io/api/v2.2/wallets/${encodeURIComponent(address)}/net-worth?exclude_spam=true&exclude_unverified_contracts=true`,
      { headers: { 'X-API-Key': env.MORALIS_API_KEY! } },
      moralisSchema,
      { provider: 'moralis', operation: 'evm-net-worth' }
    ))),
    fetchUsdRubRate()
  ]);
  return {
    totalRub: values.reduce((sum, item) => sum + Number(item.total_networth_usd), 0) * rate.rate,
    staleRate: rate.stale
  };
}

export class CryptoSource implements PortfolioSource {
  id = 'crypto' as const;
  name = 'Крипто-портфель';

  async fetchSnapshot(): Promise<SourceCollectionResult> {
    const observedAt = new Date().toISOString();
    const btc = addresses(env.BTC_ADDRESSES);
    const evm = addresses(env.ETH_ADDRESSES);
    const sol = addresses(env.SOL_ADDRESSES);
    const configured = Number(Boolean(btc.length)) + Number(Boolean(evm.length)) + Number(Boolean(sol.length)) * 2;
    if (!configured) {
      return { sourceId: this.id, sourceName: this.name, totalRub: 0, status: 'disabled' };
    }

    const tasks: Array<Promise<number | { totalRub: number; staleRate: boolean }>> = [];
    if (btc.length) tasks.push(fetchBtcRub(btc));
    if (evm.length) tasks.push(fetchEvmRub(evm));
    if (sol.length) tasks.push(fetchSolRub(sol), fetchSolUsdcRub(sol));
    const settled = await Promise.allSettled(tasks);
    const succeeded = settled.filter((item) => item.status === 'fulfilled');
    if (!succeeded.length) throw new Error('All configured crypto components failed');

    const totalRub = succeeded.reduce((sum, item) => {
      if (item.status !== 'fulfilled') return sum;
      return sum + (typeof item.value === 'number' ? item.value : item.value.totalRub);
    }, 0);
    const hasStaleRate = succeeded.some(
      (item) => item.status === 'fulfilled' && typeof item.value !== 'number' && item.value.staleRate
    );
    const partial = succeeded.length !== settled.length || hasStaleRate;
    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      observedAt,
      status: partial ? 'partial' : 'ok',
      ...(partial ? { errorMessage: 'Часть крипто-данных временно недоступна' } : {}),
      details: { configuredComponents: configured, successfulComponents: succeeded.length }
    } as SourceCollectionResult;
  }
}
