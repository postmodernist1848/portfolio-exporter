import { env } from '@/lib/config/env';
import { getJson } from '@/lib/services/http';
import type { SourceSnapshot } from '@/types/portfolio';
import type { PortfolioSource } from './types';

const TINVEST_GET_PORTFOLIO_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio';
const TINVEST_GET_ACCOUNTS_URL =
  'https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts';

type MoneyValue = {
  units?: string | number;
  nano?: number;
  currency?: string;
};

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

function moneyToNumber(value: MoneyValue | undefined): number {
  if (!value) {
    return 0;
  }

  const units = typeof value.units === 'string' ? Number(value.units) : (value.units ?? 0);
  const nano = value.nano ?? 0;
  return Number(units) + nano / 1_000_000_000;
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export class TBankSource implements PortfolioSource {
  id = 'tbank' as const;
  name = 'Т Инвестиции';

  async fetchSnapshot(): Promise<SourceSnapshot> {
    if (!env.TINVEST_API_TOKEN) {
      return {
        sourceId: this.id,
        sourceName: this.name,
        totalRub: 0,
        capturedAt: new Date().toISOString(),
        details: { status: 'API не настроен (TINVEST_API_TOKEN)' }
      };
    }

    let accountsPayload: TAccountsResponse;
    try {
      accountsPayload = await getJson<TAccountsResponse>(TINVEST_GET_ACCOUNTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.TINVEST_API_TOKEN}`
        },
        body: JSON.stringify({ status: 'ACCOUNT_STATUS_OPEN' })
      });
    } catch (error) {
      logFetchError('source:tbank:get-accounts', error);
      throw error;
    }
    const accounts = (accountsPayload.accounts ?? []).filter((account) => {
      const name = (account.name ?? '').trim().toLowerCase();
      return name !== 'кредитка';
    });

    let totalRub = 0;
    const details: Array<{ accountId: string; name?: string; totalRub: number }> = [];

    for (const account of accounts) {
      const accountId = account.id ?? account.accountId;
      if (!accountId) {
        continue;
      }

      let payload: TPortfolioResponse;
      try {
        payload = await getJson<TPortfolioResponse>(TINVEST_GET_PORTFOLIO_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.TINVEST_API_TOKEN}`
          },
          body: JSON.stringify({
            accountId,
            currency: env.TINVEST_PORTFOLIO_CURRENCY
          })
        });
      } catch (error) {
        logFetchError('source:tbank:get-portfolio', error);
        throw error;
      }
      const accountTotal = toFiniteNumber(moneyToNumber(payload.totalAmountPortfolio));
      totalRub += accountTotal;
      details.push({
        accountId,
        name: account.name,
        totalRub: accountTotal
      });
    }
    totalRub = toFiniteNumber(totalRub);
    console.log('[source:tbank] snapshot', {
      accountsTotal: accounts.length,
      usedAccounts: details.length,
      totalRub
    });

    return {
      sourceId: this.id,
      sourceName: this.name,
      totalRub,
      capturedAt: new Date().toISOString(),
      details: {
        accounts: details
      }
    };
  }
}
