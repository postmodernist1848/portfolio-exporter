import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import { z } from 'zod';
import type { PortfolioSource, SourceCollectionResult } from './types';

const OKX_DEFAULT_API_BASE_URL = 'https://www.okx.com';
const OKX_VALUATION_PATH = '/api/v5/asset/asset-valuation?ccy=RUB';

type OkxValuationResponse = {
  code?: string;
  msg?: string;
  data?: Array<{
    totalBal?: string;
    ts?: string;
    details?: Record<string, string>;
  }>;
};

async function signRequest(timestamp: string, method: string, requestPath: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}${method}${requestPath}`)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export class OkxSource implements PortfolioSource {
  id = 'okx' as const;
  name = 'OKX';

  async fetchSnapshot(): Promise<SourceCollectionResult> {
    const capturedAt = new Date().toISOString();
    const apiBaseUrl = (env.OKX_API_BASE_URL ?? OKX_DEFAULT_API_BASE_URL).replace(/\/$/, '');
    const apiKey = env.OKX_API_KEY;
    const secretKey = env.OKX_SECRET_KEY;
    const passphrase = env.OKX_API_PASSPHRASE;

    if (!apiKey || !secretKey || !passphrase) {
      return {
        sourceId: this.id,
        sourceName: this.name,
        totalRub: 0,
        status: 'disabled'
      };
    }

    const timestamp = new Date().toISOString();
    const method = 'GET';
    const signature = await signRequest(timestamp, method, OKX_VALUATION_PATH, secretKey);
    const response = await getJson(`${apiBaseUrl}${OKX_VALUATION_PATH}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase
      }
    }, z.object({
      code: z.string(),
      msg: z.string().optional(),
      data: z.array(z.object({
        totalBal: z.string(),
        ts: z.string().optional(),
        details: z.record(z.string()).optional()
      }))
    }), { provider: 'okx', operation: 'asset-valuation' });

    if (response.code !== '0') {
      throw new Error(`OKX API error ${response.code ?? 'unknown'}: ${response.msg ?? 'Unknown error'}`);
    }

    const totalRub = Number(response.data[0]?.totalBal);
    if (!Number.isFinite(totalRub)) {
      throw new Error('OKX API response does not contain a valid totalBal');
    }

    const valuation = response.data?.[0];

    console.log('[source:okx] snapshot', {
      totalRub,
      updatedAt: valuation?.ts
    });

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      observedAt: capturedAt,
      status: 'ok',
      details: {
        provider: 'okx-asset-valuation',
        currency: 'RUB',
        updatedAt: valuation?.ts
      }
    };
  }
}
