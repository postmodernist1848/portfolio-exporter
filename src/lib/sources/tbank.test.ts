import { describe, expect, it } from 'vitest';
import { selectPortfolioTotalRub } from './tbank';

describe('T-Bank portfolio totals', () => {
  it('uses totalAmountPortfolio for a regular investment account', () => {
    expect(selectPortfolioTotalRub({
      totalAmountPortfolio: { units: '100', nano: 500_000_000, currency: 'rub' }
    }, 'ACCOUNT_TYPE_TINKOFF')).toBe(100.5);
  });

  it('uses totalAmountDfa when a smart account omits totalAmountPortfolio', () => {
    expect(selectPortfolioTotalRub({
      totalAmountDfa: { units: '250', nano: 250_000_000, currency: 'rub' }
    }, 'ACCOUNT_TYPE_DFA')).toBe(250.25);
  });

  it('rejects a response without the required total', () => {
    expect(() => selectPortfolioTotalRub({}, 'ACCOUNT_TYPE_DFA')).toThrow(
      'T-Bank DFA response has no RUB total'
    );
  });
});
