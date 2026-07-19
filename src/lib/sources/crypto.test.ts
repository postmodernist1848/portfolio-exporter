import { describe, expect, it } from 'vitest';
import { buildMoralisNetWorthUrl, MORALIS_EVM_CHAINS } from './crypto';

describe('Moralis EVM request', () => {
  it('queries Ethereum and Arbitrum once for each configured address', () => {
    const url = new URL(buildMoralisNetWorthUrl('0xabc'));

    expect(MORALIS_EVM_CHAINS).toEqual(['eth', 'arbitrum']);
    expect(url.searchParams.get('chains[0]')).toBe('eth');
    expect(url.searchParams.get('chains[1]')).toBe('arbitrum');
    expect(url.searchParams.get('exclude_spam')).toBe('true');
    expect(url.searchParams.get('exclude_unverified_contracts')).toBe('true');
  });
});
