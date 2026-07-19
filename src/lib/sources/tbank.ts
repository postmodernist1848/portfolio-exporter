import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import { z } from 'zod';
import type { PortfolioSource, SourceCollectionResult } from './types';
import type { TBankBreakdown } from '@/types/portfolio';

const TINVEST_GET_PORTFOLIO_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio';
const TINVEST_GET_ACCOUNTS_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts';

type MoneyValue = { units: string | number; nano: number; currency: string };

type TPortfolioResponse = {
  totalAmountPortfolio?: MoneyValue;
  totalAmountDfa?: MoneyValue;
  positions?: Array<Record<string, unknown>>;
};

type TAccount = {
  id?: string;
  accountId?: string;
  name?: string;
  type?: string;
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

export function selectPortfolioTotalRub(
  payload: TPortfolioResponse,
  accountType?: string
): number {
  const money = accountType === 'ACCOUNT_TYPE_DFA'
    ? payload.totalAmountDfa ?? payload.totalAmountPortfolio
    : payload.totalAmountPortfolio;
  if (!money) {
    throw new Error(
      accountType === 'ACCOUNT_TYPE_DFA'
        ? 'T-Bank DFA response has no RUB total'
        : 'T-Bank portfolio response has no RUB total'
    );
  }
  return moneyToNumber(money);
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
          name: z.string().optional(),
          type: z.string().optional()
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
    const allAccounts = accountsPayload.accounts ?? [];
    const accounts = allAccounts.filter((account) => {
      const name = (account.name ?? '').trim().toLowerCase();
      return name !== 'кредитка';
    });
    const excludedCreditAccounts = allAccounts.length - accounts.length;
    console.info('[source:tbank] accounts selected', {
      openAccounts: allAccounts.length,
      portfolioAccounts: accounts.length,
      excludedCreditAccounts
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
          }).optional(),
          totalAmountDfa: z.object({
            units: z.union([z.string(), z.number()]),
            nano: z.number(),
            currency: z.literal('rub').or(z.literal('RUB'))
          }).optional(),
          positions: z.array(z.record(z.unknown())).optional()
        }), {
          provider: 'tbank',
          operation: 'portfolio',
          allowSelfSignedTls: env.TINVEST_ALLOW_SELF_SIGNED_TLS
        });
      const totalRub = selectPortfolioTotalRub(payload, account.type);
      if (!Number.isFinite(totalRub)) {
        throw new Error('T-Bank returned an invalid RUB total');
      }
      return {
        totalRub,
        positionsCount: payload.positions?.length ?? 0
      };
    }));
    const successful = accountResults.filter(
      (result): result is PromiseFulfilledResult<{ totalRub: number; positionsCount: number }> =>
        result.status === 'fulfilled'
    );
    const failedAccounts = accountResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [];
      }
      const account = accounts[index];
      const reason = (() => {
        const message = result.reason instanceof Error ? result.reason.message : '';
        return /^HTTP \d+$/.test(message) ? message : 'invalid or unavailable portfolio response';
      })();
      return [{
        accountName: account?.name?.trim() || 'Без названия',
        accountType: account?.type ?? 'неизвестен',
        reason
      }];
    });
    if (failedAccounts.length > 0) {
      console.warn('[source:tbank] some accounts failed', {
        failedAccounts: failedAccounts.length,
        accounts: failedAccounts
      });
    }
    if (accounts.length > 0 && successful.length === 0) {
      throw new Error('All T-Bank accounts failed');
    }
    const totalRub = toFiniteNumber(successful.reduce((sum, result) => sum + result.value.totalRub, 0));
    const partial = successful.length !== accountResults.length;
    console.log('[source:tbank] snapshot', {
      accountsTotal: accounts.length,
      usedAccounts: successful.length,
      totalRub
    });

    const breakdown: TBankBreakdown = {
      kind: 'tbank',
      accounts: accountResults.map((result, index) => {
        const account = accounts[index];
        if (result.status === 'fulfilled') {
          return {
            name: account.name?.trim() || 'Без названия',
            type: account.type ?? 'ACCOUNT_TYPE_UNSPECIFIED',
            totalRub: result.value.totalRub,
            positionsCount: result.value.positionsCount,
            status: 'ok'
          };
        }
        return {
          name: account.name?.trim() || 'Без названия',
          type: account.type ?? 'ACCOUNT_TYPE_UNSPECIFIED',
          totalRub: null,
          positionsCount: 0,
          status: 'error',
          errorMessage: 'Портфель счёта недоступен'
        };
      }),
      excludedAccounts: allAccounts
        .filter((account) => (account.name ?? '').trim().toLowerCase() === 'кредитка')
        .map((account) => ({
          name: account.name?.trim() || 'Кредитка',
          reason: 'Исключён из инвестиционного портфеля'
        }))
    };

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      observedAt: new Date().toISOString(),
      status: partial ? 'partial' : 'ok',
      ...(partial ? { errorMessage: 'Часть счетов временно недоступна' } : {}),
      details: breakdown as unknown as Record<string, unknown>
    } as SourceCollectionResult;
  }
}
