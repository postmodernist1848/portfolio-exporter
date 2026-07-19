import { describe, expect, it } from 'vitest';
import { buildCryptoMarketPrices } from './currency';

const now = 1_700_000_000_000;

function fixture(bitcoinRub = 9_000_000, bitcoinUsd = 100_000) {
  const last_updated_at = now / 1000;
  return {
    bitcoin: { rub: bitcoinRub, usd: bitcoinUsd, last_updated_at },
    solana: { rub: 15_000, usd: 166, last_updated_at }
  };
}

describe('CoinGecko crypto market prices', () => {
  it('derives USD/RUB from the BTC cross price', () => {
    const prices = buildCryptoMarketPrices(fixture(8_820_000, 98_000), now);

    expect(prices.usdRubRate).toBe(90);
  });

  it('rejects an outdated provider snapshot', () => {
    expect(() => buildCryptoMarketPrices(
      fixture(),
      now + 16 * 60 * 1000
    )).toThrow('CoinGecko prices are stale');
  });
});
