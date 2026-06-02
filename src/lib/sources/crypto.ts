import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import type { SourceSnapshot } from '@/types/portfolio';
import type { PortfolioSource } from './types';

type MoralisNetWorthResponse = {
  total_networth_usd?: string;
};
type MoralisSolanaPortfolioResponse = Record<string, unknown>;

type CoinGeckoPriceResponse = Record<string, Record<string, number>>;
type CbrDailyResponse = {
  Valute?: {
    USD?: {
      Value?: number;
    };
  };
};

const MORALIS_RETRIES = 5;
const MORALIS_BACKOFF_BASE_MS = 1000;
const USD_RUB_CACHE_TTL_MS = 60 * 60 * 1000;

let usdRubCache: { rate: number; expiresAt: number } | null = null;

function parseAddresses(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function moralisHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-API-Key': env.MORALIS_API_KEY ?? ''
  };
}

async function fetchBtcBalance(addresses: string[]): Promise<number> {
  if (addresses.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    addresses.map((address) =>
      getJson<{ chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }>(
        `https://blockstream.info/api/address/${address}`
      )
    )
  );

  return results.reduce((sum, result) => {
    const satoshis = result.chain_stats.funded_txo_sum - result.chain_stats.spent_txo_sum;
    return sum + satoshis / 100_000_000;
  }, 0);
}

async function fetchSolBalance(addresses: string[]): Promise<number> {
  if (addresses.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    addresses.map((address) =>
      getJson<{ result?: { value?: number } }>('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address]
        })
      })
    )
  );

  return results.reduce((sum, result) => sum + ((result.result?.value ?? 0) / 1e9), 0);
}

async function fetchPriceMap(ids: string[], fiat: string): Promise<Record<string, number>> {
  const response = await getJson<CoinGeckoPriceResponse>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${fiat}`
  );

  return Object.fromEntries(ids.map((id) => [id, response[id]?.[fiat] ?? 0]));
}

async function fetchUsdRubRate(): Promise<number> {
  const now = Date.now();
  if (usdRubCache && usdRubCache.expiresAt > now) {
    console.log('[source:crypto:cbr] USD/RUB cache hit', { rate: usdRubCache.rate });
    return usdRubCache.rate;
  }

  const response = await getJson<CbrDailyResponse>('https://www.cbr-xml-daily.ru/daily_json.js');
  const rate = response.Valute?.USD?.Value ?? 0;
  const safeRate = toFiniteNumber(rate);

  if (safeRate > 0) {
    usdRubCache = {
      rate: safeRate,
      expiresAt: now + USD_RUB_CACHE_TTL_MS
    };
  }

  console.log('[source:crypto:cbr] USD/RUB fetched', { rate: safeRate });
  return safeRate;
}

async function fetchWithRetry<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MORALIS_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`[${scope}] retry`, {
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < MORALIS_RETRIES) {
        await sleep(MORALIS_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchMoralisEvmNetWorthUsd(address: string): Promise<number> {
  const response = await fetchWithRetry(`[source:crypto:moralis:evm:${address}]`, async () =>
    getJson<MoralisNetWorthResponse>(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/net-worth?exclude_spam=true&exclude_unverified_contracts=true`,
      { headers: moralisHeaders() }
    )
  );

  const value = Number(response.total_networth_usd ?? '0');
  return toFiniteNumber(value);
}

function findUsdTotal(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUsdTotal(item);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, raw] of entries) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'total_usd' ||
      normalized === 'totalusd' ||
      normalized === 'total_networth_usd' ||
      normalized === 'networthusd' ||
      normalized === 'usdvalue'
    ) {
      const parsed = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  for (const [, raw] of entries) {
    const found = findUsdTotal(raw);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

async function fetchMoralisSolanaNetWorthUsd(address: string): Promise<number> {
  const response = await fetchWithRetry(`[source:crypto:moralis:sol:${address}]`, async () =>
    getJson<MoralisSolanaPortfolioResponse>(
      `https://solana-gateway.moralis.io/account/mainnet/${address}/portfolio`,
      { headers: moralisHeaders() }
    )
  );

  const totalUsd = findUsdTotal(response);
  if (totalUsd === null) {
    console.error('[source:crypto:moralis] solana payload without USD total', {
      address,
      payloadType: Array.isArray(response) ? 'array' : typeof response,
      payloadKeys: response && typeof response === 'object' ? Object.keys(response as Record<string, unknown>) : [],
      payloadPreview: JSON.stringify(response).slice(0, 500)
    });
    throw new Error('Moralis Solana portfolio: USD total field not found');
  }
  return toFiniteNumber(totalUsd);
}

async function fetchMoralisEvmAddressesUsd(addresses: string[]): Promise<number> {
  let sum = 0;
  for (const address of addresses) {
    try {
      const value = await fetchMoralisEvmNetWorthUsd(address);
      sum += value;
    } catch (error) {
      console.error('[source:crypto:moralis] evm address failed', {
        address,
        error: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error.cause : undefined
      });
    }
  }
  return sum;
}

async function fetchMoralisSolAddressesUsd(addresses: string[]): Promise<number> {
  let sum = 0;
  for (const address of addresses) {
    try {
      const value = await fetchMoralisSolanaNetWorthUsd(address);
      sum += value;
    } catch (error) {
      console.error('[source:crypto:moralis] solana address failed', {
        address,
        error: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error.cause : undefined
      });
    }
  }
  return sum;
}

export class CryptoSource implements PortfolioSource {
  id = 'crypto' as const;
  name = 'Крипто-портфель';

  async fetchSnapshot(): Promise<SourceSnapshot> {
    if (!env.MORALIS_API_KEY) {
      console.warn('[source:crypto] MORALIS_API_KEY is missing; source is disabled');
      return {
        sourceId: this.id,
        sourceName: this.name,
        totalRub: 0,
        capturedAt: new Date().toISOString(),
        details: { status: 'API не настроен (MORALIS_API_KEY)' }
      };
    }

    const fiat = env.CRYPTO_FIAT.toLowerCase();
    const btcAddresses = parseAddresses(env.BTC_ADDRESSES);
    const ethAddresses = parseAddresses(env.ETH_ADDRESSES);
    const solAddresses = parseAddresses(env.SOL_ADDRESSES);

    const [btcBalance, solBalance, prices, usdRub, evmUsd, solUsd] = await Promise.all([
      fetchBtcBalance(btcAddresses),
      fetchSolBalance(solAddresses),
      fetchPriceMap(['bitcoin', 'solana'], fiat),
      fetchUsdRubRate(),
      fetchMoralisEvmAddressesUsd(ethAddresses),
      fetchMoralisSolAddressesUsd(solAddresses)
    ]);

    const btcRub = toFiniteNumber(btcBalance * (prices.bitcoin ?? 0));
    const solRubFallback = toFiniteNumber(solBalance * (prices.solana ?? 0));
    const moralisEvmRub = toFiniteNumber(evmUsd * usdRub);
    const moralisSolRub = toFiniteNumber(solUsd * usdRub);
    const totalRub = toFiniteNumber(btcRub + moralisEvmRub + (moralisSolRub > 0 ? moralisSolRub : solRubFallback));

    console.log('[source:crypto] snapshot', {
      btcAddresses: btcAddresses.length,
      ethAddresses: ethAddresses.length,
      solAddresses: solAddresses.length,
      btcBalance,
      solBalance,
      btcRub,
      evmUsd,
      solUsd,
      usdRub,
      moralisEvmRub,
      moralisSolRub,
      solRubFallback,
      totalRub
    });

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      capturedAt: new Date().toISOString(),
      details: {
        fiat,
        provider: 'moralis',
        addressesTotal: btcAddresses.length + ethAddresses.length + solAddresses.length
      }
    };
  }
}
