import { describe, expect, it } from 'vitest';
import { buildAlchemyRequestBody } from './alchemy';

describe('Alchemy EVM request', () => {
  it('queries Ethereum and Arbitrum with balances, metadata, and prices', () => {
    const body = buildAlchemyRequestBody(['0xabc']);

    expect(body.addresses).toEqual([{
      address: '0xabc',
      networks: ['eth-mainnet', 'arb-mainnet']
    }]);
    expect(body).toMatchObject({
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
      includeBlockMetadata: true
    });
  });
});
