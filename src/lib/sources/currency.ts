import { z } from 'zod';
import { getJson } from '@/lib/services/http';

const coinPriceSchema = z.object({
  rub: z.number().positive(),
  usd: z.number().positive(),
  last_updated_at: z.number().int().positive()
});
const responseSchema = z.object({
  bitcoin: coinPriceSchema,
  solana: coinPriceSchema
});

export type CryptoMarketPrices = {
  bitcoinRub: number;
  solanaRub: number;
  usdRubRate: number;
  stale: boolean;
  observedAt: number;
};

const PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price'
  + '?ids=bitcoin,solana'
  + '&vs_currencies=rub,usd'
  + '&include_last_updated_at=true';
const CACHE_TTL_MS = 60 * 1000;
const MAX_PROVIDER_AGE_MS = 15 * 60 * 1000;
let lastKnownGood: CryptoMarketPrices | null = null;
let fetchedAt = 0;

export function buildCryptoMarketPrices(
  response: z.infer<typeof responseSchema>,
  now = Date.now()
): CryptoMarketPrices {
  const observedAt = Math.min(
    response.bitcoin.last_updated_at,
    response.solana.last_updated_at
  ) * 1000;
  if (now - observedAt > MAX_PROVIDER_AGE_MS) {
    throw new Error('CoinGecko prices are stale');
  }
  return {
    bitcoinRub: response.bitcoin.rub,
    solanaRub: response.solana.rub,
    usdRubRate: response.bitcoin.rub / response.bitcoin.usd,
    stale: false,
    observedAt
  };
}

export async function fetchCryptoMarketPrices(): Promise<CryptoMarketPrices> {
  if (lastKnownGood && Date.now() - fetchedAt < CACHE_TTL_MS) {
    return lastKnownGood;
  }

  try {
    const response = await getJson(
      PRICE_URL,
      undefined,
      responseSchema,
      { provider: 'coingecko', operation: 'crypto-rub-prices' }
    );
    lastKnownGood = buildCryptoMarketPrices(response);
    fetchedAt = Date.now();
    return lastKnownGood;
  } catch (error) {
    if (lastKnownGood) {
      console.warn('[currency] using last-known-good CoinGecko price snapshot');
      return { ...lastKnownGood, stale: true };
    }
    throw error;
  }
}
