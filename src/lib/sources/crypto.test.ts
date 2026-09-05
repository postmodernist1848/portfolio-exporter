import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildAlchemyRequestBody } from './alchemy';
import { safeCryptoFailure } from './crypto';

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

describe('crypto failure logging', () => {
  it('reports validation paths without rejected values or messages', () => {
    const schema = z.object({ data: z.object({ tokens: z.array(z.object({
      tokenBalance: z.string()
    })) }) });
    let error: unknown;
    try {
      schema.parse({ data: { tokens: [{ tokenBalance: { secret: 'do-not-log' } }] } });
    } catch (caught) {
      error = caught;
    }

    const summary = safeCryptoFailure(error);

    expect(summary).toEqual({
      errorType: 'validation',
      issues: [{ code: 'invalid_type', path: 'data.tokens.0.tokenBalance' }]
    });
    expect(JSON.stringify(summary)).not.toContain('do-not-log');
  });

  it('does not include arbitrary error messages', () => {
    expect(safeCryptoFailure(new Error('credential-or-payload'))).toEqual({
      errorType: 'Error'
    });
  });
});
