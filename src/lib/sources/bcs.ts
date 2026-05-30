import { env } from '@/lib/config/env';
import { getJson, getText } from '@/lib/services/http';
import type { SourceSnapshot } from '@/types/portfolio';
import type { PortfolioSource } from './types';

const BCS_AUTH_URL = 'https://be.broker.ru/trade-api-keycloak/realms/tradeapi/protocol/openid-connect/token';
const BCS_PORTFOLIO_URL = 'https://be.broker.ru/trade-api-bff-portfolio/api/v1/portfolio';

function logFetchError(scope: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${scope}] fetch error`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    return;
  }

  console.error(`[${scope}] fetch error`, { error: String(error) });
}

async function getBcsAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.BCS_CLIENT_ID,
    refresh_token: env.BCS_REFRESH_TOKEN ?? '',
    grant_type: 'refresh_token'
  });

  let payload: { access_token?: string };
  try {
    payload = await getJson<{ access_token?: string }>(BCS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
  } catch (error) {
    logFetchError('source:bcs:auth', error);
    throw error;
  }
  if (!payload.access_token) {
    throw new Error('BCS auth failed: access_token is missing');
  }

  return payload.access_token;
}

function pickFirstNumberByKey(value: unknown, keys: Set<string>): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickFirstNumberByKey(item, keys);
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
  for (const [key, val] of entries) {
    if (keys.has(key) && typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
  }
  for (const [, val] of entries) {
    const found = pickFirstNumberByKey(val, keys);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return { rawText: value };
    }
  }
  return value;
}

function getPositions(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }

  if (payload && typeof payload === 'object') {
    const maybePositions = (payload as Record<string, unknown>).positions;
    if (Array.isArray(maybePositions)) {
      return maybePositions.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    }
  }

  return [];
}

function sumBcsPositionsRub(positions: Array<Record<string, unknown>>): number {
  const groups = new Map<string, number>();

  for (const position of positions) {
    const account = String(position.account ?? '');
    const subAccountId = String(position.subAccountId ?? '');
    const agreementId = String(position.agreementId ?? '');
    const exchange = String(position.exchange ?? '');
    const ticker = String(position.ticker ?? '');
    const instrumentType = String(position.instrumentType ?? '');
    const upperType = String(position.upperType ?? '');
    const expireDate = String(position.expireDate ?? '');

    const key = [
      agreementId,
      subAccountId,
      account,
      exchange,
      ticker,
      instrumentType,
      upperType,
      expireDate
    ].join('|');

    let rubValue = toNumber(position.currentValueRub);
    if (rubValue === null) {
      rubValue = toNumber(position.balanceValueRub);
    }
    if (rubValue === null) {
      const currentValue = toNumber(position.currentValue);
      const currency = typeof position.currency === 'string' ? position.currency.toUpperCase() : '';
      rubValue = currentValue !== null && currency === 'RUB' ? currentValue : null;
    }
    if (rubValue === null) {
      continue;
    }

    const existing = groups.get(key);
    if (existing === undefined || Math.abs(rubValue) > Math.abs(existing)) {
      groups.set(key, rubValue);
    }
  }

  let sum = 0;
  for (const value of groups.values()) {
    sum += value;
  }
  return sum;
}

export class BcsSource implements PortfolioSource {
  id = 'bcs' as const;
  name = 'БКС Мир Инвестиций';

  async fetchSnapshot(): Promise<SourceSnapshot> {
    if (!env.BCS_REFRESH_TOKEN) {
      return {
        sourceId: this.id,
        sourceName: this.name,
        totalRub: 0,
        capturedAt: new Date().toISOString(),
        details: { status: 'API не настроен (BCS_REFRESH_TOKEN)' }
      };
    }

    const accessToken = await getBcsAccessToken();
    let bodyText: string;
    try {
      bodyText = await getText(BCS_PORTFOLIO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
    } catch (error) {
      logFetchError('source:bcs:portfolio', error);
      throw error;
    }
    const payload = parsePayload(bodyText);
    const positions = getPositions(payload);
    const fromPositions = sumBcsPositionsRub(positions);
    const fromPositionsRaw = positions.reduce((sum, position) => {
      const value = toNumber(position.currentValueRub);
      return sum + (value ?? 0);
    }, 0);
    const fromRoot =
      pickFirstNumberByKey(payload, new Set(['totalAmountRub', 'totalRub', 'portfolioAmountRub', 'totalValueRub'])) ??
      0;
    const totalRub = toFiniteNumber(fromPositions > 0 ? fromPositions : fromRoot);
    console.log('[source:bcs] snapshot', {
      totalRub,
      payloadType: Array.isArray(payload) ? 'array' : typeof payload,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>) : [],
      positionsCount: positions.length,
      firstPositionKeys: positions[0] ? Object.keys(positions[0]) : [],
      fromPositionsRaw,
      fromPositionsDedup: fromPositions
    });

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      capturedAt: new Date().toISOString(),
      details: {
        raw: payload
      }
    };
  }
}
