import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import { z } from 'zod';
import type { PortfolioSource, SourceCollectionResult } from './types';

const TINVEST_GET_PORTFOLIO_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio';
const TINVEST_GET_ACCOUNTS_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts';

type MoneyValue = { units: string | number; nano: number; currency: string };

type TPortfolioResponse = {
  totalAmountPortfolio?: MoneyValue;
  positions?: Array<Record<string, unknown>>;
};

type TAccount = {
  id?: string;
  accountId?: string;
  name?: string;
};

type TAccountsResponse = {
  accounts?: TAccount[];
};

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

function moneyToNumber(value: MoneyValue): number {
  const units = typeof value.units === 'string' ? Number(value.units) : value.units;
  const nano = value.nano;
  return Number(units) + nano / 1_000_000_000;
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export class TBankSource implements PortfolioSource {
  id = 'tbank' as const;
  name = 'Т Инвестиции';

  async fetchSnapshot(): Promise<SourceCollectionResult> {
    if (!env.TINVEST_API_TOKEN) {
      return {
        sourceId: this.id,
        sourceName: this.name,
        totalRub: 0,
        status: 'disabled'
      };
    }

    let accountsPayload: TAccountsResponse;
    try {
      accountsPayload = await getJson(TINVEST_GET_ACCOUNTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.TINVEST_API_TOKEN}`
        },
        body: JSON.stringify({ status: 'ACCOUNT_STATUS_OPEN' })
      }, z.object({
        accounts: z.array(z.object({
          id: z.string().optional(),
          accountId: z.string().optional(),
          name: z.string().optional()
        }))
      }), {
        provider: 'tbank',
        operation: 'accounts',
        allowSelfSignedTls: env.TINVEST_ALLOW_SELF_SIGNED_TLS
      });
    } catch (error) {
      logFetchError('source:tbank:get-accounts', error);
      throw error;
    }
    const accounts = (accountsPayload.accounts ?? []).filter((account) => {
      const name = (account.name ?? '').trim().toLowerCase();
      return name !== 'кредитка';
    });

    const accountResults = await Promise.allSettled(accounts.map(async (account) => {
      const accountId = account.id ?? account.accountId;
      if (!accountId) {
        throw new Error('Account ID is missing');
      }
      const payload = await getJson(TINVEST_GET_PORTFOLIO_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.TINVEST_API_TOKEN}`
          },
          body: JSON.stringify({
            accountId,
            currency: 'RUB'
          })
        }, z.object({
          totalAmountPortfolio: z.object({
            units: z.union([z.string(), z.number()]),
            nano: z.number(),
            currency: z.literal('rub').or(z.literal('RUB'))
          }),
          positions: z.array(z.record(z.unknown())).optional()
        }), {
          provider: 'tbank',
          operation: 'portfolio',
          allowSelfSignedTls: env.TINVEST_ALLOW_SELF_SIGNED_TLS
        });
      const totalRub = moneyToNumber(payload.totalAmountPortfolio);
      if (!Number.isFinite(totalRub)) {
        throw new Error('T-Bank returned an invalid RUB total');
      }
      return totalRub;
    }));
    const successful = accountResults.filter(
      (result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled'
    );
    if (accounts.length > 0 && successful.length === 0) {
      throw new Error('All T-Bank accounts failed');
    }
    const totalRub = toFiniteNumber(successful.reduce((sum, result) => sum + result.value, 0));
    const partial = successful.length !== accountResults.length;
    console.log('[source:tbank] snapshot', {
      accountsTotal: accounts.length,
      usedAccounts: successful.length,
      totalRub
    });

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      observedAt: new Date().toISOString(),
      status: partial ? 'partial' : 'ok',
      ...(partial ? { errorMessage: 'Часть счетов временно недоступна' } : {}),
      details: {
        accountsTotal: accounts.length,
        successfulAccounts: successful.length
      }
    } as SourceCollectionResult;
  }
}
