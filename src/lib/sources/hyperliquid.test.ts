import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHyperliquidBreakdown, hyperliquidInfoBody } from './hyperliquid';

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function mockHyperliquid(mode: 'default' | 'unifiedAccount') {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { type: string };
    const fixtures: Record<string, unknown> = {
      spotMetaAndAssetCtxs: [
        {
          tokens: [
            { name: 'USDC', index: 0 },
            { name: 'HYPE', index: 150 }
          ],
          universe: [{ name: '@107', tokens: [150, 0], index: 107 }]
        },
        [{ markPx: '10', midPx: '10' }]
      ],
      subAccounts: [],
      userAbstraction: mode,
      clearinghouseState: { marginSummary: { accountValue: '100' } },
      spotClearinghouseState: {
        balances: [
          { coin: 'USDC', token: 0, total: '10' },
          { coin: 'HYPE', token: 150, total: '2' }
        ]
      },
      userVaultEquities: [{ vaultAddress: '0xvault', equity: '5' }],
      delegatorSummary: {
        delegated: '2',
        undelegated: '1',
        totalPendingWithdrawal: '0'
      },
      portfolio: [
        ['day', {
          accountValueHistory: [[1_700_000_000_000, '170']],
          pnlHistory: [],
          vlm: '0'
        }],
        ['perpDay', {
          accountValueHistory: [[1_700_000_000_000, '100']],
          pnlHistory: [],
          vlm: '0'
        }]
      ]
    };
    return response(fixtures[request.type]);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hyperliquid portfolio valuation', () => {
  it('builds POST info requests without credentials', () => {
    const request = hyperliquidInfoBody('clearinghouseState', '0xabc');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toEqual({
      type: 'clearinghouseState',
      user: '0xabc'
    });
  });

  it('uses the official portfolio value while retaining diagnostic components', async () => {
    mockHyperliquid('default');

    const result = await fetchHyperliquidBreakdown(
      ['0x0000000000000000000000000000000000000001'],
      Promise.resolve({
        bitcoinRub: 9_000_000,
        solanaRub: 15_000,
        usdRubRate: 90,
        stale: false,
        observedAt: Date.now()
      })
    );

    expect(result.breakdown.wallets[0].accounts[0]).toMatchObject({
      perpetualsUsd: 100,
      spotUsd: 30,
      vaultsUsd: 5,
      stakingUsd: 30,
      totalUsd: 170,
      portfolioReportedAt: 1_700_000_000_000
    });
    expect(result.totalRub).toBe(15_300);
    expect(result.incomplete).toBe(false);
  });

  it('does not double count perpetual account value in unified mode', async () => {
    mockHyperliquid('unifiedAccount');

    const result = await fetchHyperliquidBreakdown(
      ['0x0000000000000000000000000000000000000001'],
      Promise.resolve({
        bitcoinRub: 9_000_000,
        solanaRub: 15_000,
        usdRubRate: 90,
        stale: false,
        observedAt: Date.now()
      })
    );

    expect(result.breakdown.wallets[0].accounts[0].perpetualsUsd).toBe(0);
    expect(result.breakdown.wallets[0].accounts[0].totalUsd).toBe(170);
  });
});
