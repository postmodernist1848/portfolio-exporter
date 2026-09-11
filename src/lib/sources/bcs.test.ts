import { describe, expect, it } from 'vitest';
import { buildBcsAccounts } from './bcs';

const common = {
  account: 'Основной',
  agreementId: 'agreement',
  subAccountId: 'subaccount',
  exchange: 'MOEX',
  board: 'TQBR',
  instrumentType: 'STOCK',
  upperType: 'RUSSIA',
  currency: 'RUB'
};

describe('BCS position normalization', () => {
  it('uses the furthest settlement state and removes fully closed positions', () => {
    const accounts = buildBcsAccounts([
      { ...common, ticker: 'SOLD', term: 'T0', quantity: 20, currentValueRub: 20_000 },
      { ...common, ticker: 'BOUGHT', term: 'T1', quantity: 100, currentValueRub: 1_000 },
      { ...common, ticker: 'SOLD', term: 'T1', quantity: 0, currentValueRub: 0 },
      { ...common, ticker: 'BOUGHT', term: 'T2', quantity: 100, currentValueRub: 1_000 },
      { ...common, ticker: 'SOLD', term: 'T365', quantity: 0, currentValueRub: 0 },
      { ...common, ticker: 'BOUGHT', term: 'T365', quantity: 100, currentValueRub: 1_000 },
      { ...common, ticker: 'RUB', instrumentType: 'CURRENCY', term: 'T365', quantity: -50,
        currentValueRub: -50 }
    ]);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].totalRub).toBe(950);
    expect(accounts[0].positions).toEqual([
      expect.objectContaining({ ticker: 'BOUGHT', quantity: 100, totalRub: 1_000 }),
      expect.objectContaining({ ticker: 'RUB', quantity: -50, totalRub: -50 })
    ]);
  });

  it('keeps the largest valuation fallback when settlement terms are unavailable', () => {
    const accounts = buildBcsAccounts([
      { ...common, ticker: 'LEGACY', quantity: 1, currentValueRub: 100 },
      { ...common, ticker: 'LEGACY', quantity: 2, currentValueRub: 200 }
    ]);

    expect(accounts[0].positions).toEqual([
      expect.objectContaining({ ticker: 'LEGACY', quantity: 2, totalRub: 200 })
    ]);
  });

  it('retains non-zero quantities even when their current value is zero', () => {
    const accounts = buildBcsAccounts([
      { ...common, ticker: 'HALTED', term: 'T365', quantity: 5, currentValueRub: 0 }
    ]);

    expect(accounts[0].positions).toEqual([
      expect.objectContaining({ ticker: 'HALTED', quantity: 5, totalRub: 0 })
    ]);
  });
});
