import { z } from 'zod';
import { getJson } from '@/lib/services/http';

const responseSchema = z.object({
  Valute: z.object({
    USD: z.object({ Value: z.number().positive() })
  })
});

const CACHE_TTL_MS = 60 * 60 * 1000;
let lastKnownGood: { rate: number; fetchedAt: number } | null = null;

export async function fetchUsdRubRate(): Promise<{ rate: number; stale: boolean }> {
  if (lastKnownGood && Date.now() - lastKnownGood.fetchedAt < CACHE_TTL_MS) {
    return { rate: lastKnownGood.rate, stale: false };
  }

  try {
    const response = await getJson(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      undefined,
      responseSchema,
      { provider: 'cbr', operation: 'usd-rub-rate' }
    );
    lastKnownGood = { rate: response.Valute.USD.Value, fetchedAt: Date.now() };
    return { rate: lastKnownGood.rate, stale: false };
  } catch (error) {
    if (lastKnownGood) {
      console.warn('[currency] using last-known-good USD/RUB rate');
      return { rate: lastKnownGood.rate, stale: true };
    }
    throw error;
  }
}
