/**
 * Manually updated after reconciling purchases in research/btc-cost-basis/.
 * Both OKX hedges treated as synthetic sells/rebuys; identified transfer fees
 * capitalized, hedge funding separate. USDT/USDC/USD assumed at parity.
 * Applies to the current BTC balance in BTC_ADDRESSES. Update after acquisitions
 * or disposals that change the remaining weighted average, then collect again.
 */
export const BITCOIN_AVERAGE_PRICE_USDT = 75_282.643740;

export function calculateBitcoinCostBasis(
  balanceBtc: number,
  priceRub: number,
  usdRubRate: number
) {
  const averagePriceRub = BITCOIN_AVERAGE_PRICE_USDT * usdRubRate;
  const costBasisRub = balanceBtc * averagePriceRub;
  const unrealizedPnlRub = balanceBtc * (priceRub - averagePriceRub);
  return {
    averagePriceUsdt: BITCOIN_AVERAGE_PRICE_USDT,
    costBasisRub,
    unrealizedPnlRub,
    unrealizedPnlPercent: balanceBtc > 0
      ? (priceRub / averagePriceRub - 1) * 100
      : null
  };
}
