import { describe, expect, it, vi } from 'vitest';
import { BITCOIN_AVERAGE_PRICE_USDT, calculateBitcoinCostBasis } from '@/lib/config/bitcoin-cost-basis';
import { CryptoSource } from './crypto';
import { fetchCryptoMarketPrices } from './currency';

vi.mock('@/lib/config/env', () => ({ env: { BTC_ADDRESSES: 'cold,hot' } }));
vi.mock('@/lib/services/http', () => ({
  getJson: vi.fn(async (url: string) => ({
    chain_stats: {
      funded_txo_sum: url.endsWith('/cold') ? 20_000_000 : 5_000_000,
      spent_txo_sum: url.endsWith('/cold') ? 10_000_000 : 0
    }
  }))
}));
vi.mock('./currency', () => ({ fetchCryptoMarketPrices: vi.fn() }));

const prices = {
  bitcoinRub: 8_000_000,
  solanaRub: 10_000,
  usdRubRate: 100,
  stale: false,
  observedAt: 1
};

describe('Bitcoin cost basis in collected snapshots', () => {
  it('persists aggregate P&L using the same snapshot FX without changing valuation', async () => {
    vi.mocked(fetchCryptoMarketPrices).mockResolvedValue(prices);
    const snapshot = await new CryptoSource().fetchSnapshot();
    const basis = snapshot.details?.btc as {
      costBasis: { averagePriceUsdt: number; costBasisRub: number; unrealizedPnlRub: number; unrealizedPnlPercent: number };
    };
    expect(snapshot.totalRub).toBe(1_200_000);
    expect(snapshot.status).toBe('ok');
    expect(basis.costBasis.averagePriceUsdt).toBe(BITCOIN_AVERAGE_PRICE_USDT);
    expect(basis.costBasis.costBasisRub).toBeCloseTo(1_129_239.65610);
    expect(basis.costBasis.unrealizedPnlRub).toBeCloseTo(70_760.34390);
    expect(basis.costBasis.unrealizedPnlPercent).toBeCloseTo(6.2661936744571545);
  });

  it('marks BTC using last-known-good prices as partial', async () => {
    vi.mocked(fetchCryptoMarketPrices).mockResolvedValue({ ...prices, stale: true });
    expect((await new CryptoSource().fetchSnapshot()).status).toBe('partial');
  });

  it('handles losses, break-even and an empty wallet', () => {
    expect(calculateBitcoinCostBasis(0.1, 6_000_000, 100).unrealizedPnlRub).toBeCloseTo(-152_826.43740);
    const even = calculateBitcoinCostBasis(0.1, BITCOIN_AVERAGE_PRICE_USDT * 100, 100);
    expect(even.unrealizedPnlRub).toBe(0);
    expect(even.unrealizedPnlPercent).toBe(0);
    expect(calculateBitcoinCostBasis(0, 6_000_000, 100)).toMatchObject({
      costBasisRub: 0,
      unrealizedPnlPercent: null
    });
  });
});
