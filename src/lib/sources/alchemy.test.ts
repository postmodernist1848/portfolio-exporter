import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/lib/config/env';
import { fetchAlchemyEvmWallets } from './alchemy';

const originalKey = env.ALCHEMY_API_KEY;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('Alchemy EVM adapter', () => {
  beforeEach(() => {
    env.ALCHEMY_API_KEY = 'test-key';
  });

  afterEach(() => {
    env.ALCHEMY_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('paginates and aggregates native and ERC-20 values by wallet and chain', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        data: {
          tokens: [{
            address: '0xABC',
            network: 'eth-mainnet',
            tokenAddress: null,
            tokenBalance: '0xde0b6b3a7640000',
            tokenMetadata: { decimals: 18, symbol: 'ETH' },
            tokenPrices: [{ currency: 'usd', value: '2000', lastUpdatedAt: '2026-09-05T00:00:00Z' }]
          }],
          pageKey: 'next',
          blockMetadata: {
            'eth-mainnet': { blockNumber: '0x1', blockHash: '0xabc', blockTimestamp: '2026-09-05T00:00:00Z' },
            'arb-mainnet': { blockNumber: '0x2', blockHash: '0xdef', blockTimestamp: '2026-09-05T00:00:00Z' }
          }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          tokens: [{
            address: '0xabc',
            network: 'arb-mainnet',
            tokenAddress: '0xusdc',
            tokenBalance: '0x16e360',
            tokenMetadata: { decimals: 6, symbol: 'USDC' },
            tokenPrices: [{ currency: 'USD', value: '1', lastUpdatedAt: '2026-09-05T00:00:00Z' }]
          }],
          pageKey: null
        }
      }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.incomplete).toBe(false);
    expect(result.totalUsd).toBe(2001.5);
    expect(result.wallets[0]).toMatchObject({
      address: '0xabc',
      totalUsd: 2001.5,
      chains: [{ chain: 'eth', totalUsd: 2000 }, { chain: 'arbitrum', totalUsd: 1.5 }],
      excludedAssetCount: 0
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ pageKey: 'next' });
  });

  it('preserves usable values and reports a failed network as incomplete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: {
        tokens: [{
          address: '0xabc',
          network: 'eth-mainnet',
          tokenAddress: null,
          tokenBalance: '0x0',
          tokenMetadata: { decimals: 18 },
          tokenPrices: []
        }]
      },
      error: {
        message: 'Failed to fetch tokens on certain networks',
        partialErrors: [{ network: 'arb-mainnet', message: 'Internal server error' }]
      }
    }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.incomplete).toBe(true);
    expect(result.wallets[0].unavailableChains).toEqual(['arbitrum']);
    expect(result.wallets[0].totalUsd).toBe(0);
  });

  it('excludes unpriceable assets without inventing a zero-valued holding', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: {
        tokens: [{
          address: '0xabc',
          network: 'eth-mainnet',
          tokenAddress: '0xtoken',
          tokenBalance: '0x1',
          tokenMetadata: { decimals: 0 },
          tokenPrices: []
        }]
      }
    }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.incomplete).toBe(false);
    expect(result.wallets[0].excludedAssetCount).toBe(1);
    expect(result.totalUsd).toBe(0);
  });

  it('accepts null native-token decimals and applies the EVM native precision', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: {
        tokens: [{
          address: '0xabc',
          network: 'eth-mainnet',
          tokenAddress: null,
          tokenBalance: '0xde0b6b3a7640000',
          tokenMetadata: { decimals: null, symbol: null, name: null, logo: null },
          tokenPrices: [{ currency: 'usd', value: '2000', lastUpdatedAt: '2026-09-05T00:00:00Z' }]
        }]
      }
    }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.incomplete).toBe(false);
    expect(result.wallets[0].chains).toEqual([
      { chain: 'eth', totalUsd: 2000 },
      { chain: 'arbitrum', totalUsd: 0 }
    ]);
    expect(result.wallets[0].excludedAssetCount).toBe(0);
  });

  it('excludes an ERC-20 token when its decimals are null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: {
        tokens: [{
          address: '0xabc',
          network: 'arb-mainnet',
          tokenAddress: '0xtoken',
          tokenBalance: '0x1',
          tokenMetadata: { decimals: null },
          tokenPrices: [{ currency: 'usd', value: '1', lastUpdatedAt: '2026-09-05T00:00:00Z' }]
        }]
      }
    }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.totalUsd).toBe(0);
    expect(result.wallets[0].excludedAssetCount).toBe(1);
  });

  it('marks token-level provider errors as incomplete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: {
        tokens: [{
          address: '0xabc',
          network: 'eth-mainnet',
          tokenAddress: '0xtoken',
          tokenBalance: '0x1',
          error: 'Price unavailable'
        }]
      }
    }));

    const result = await fetchAlchemyEvmWallets(['0xabc']);

    expect(result.incomplete).toBe(true);
    expect(result.wallets[0].excludedAssetCount).toBe(1);
  });

  it('chunks more than two configured addresses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({
      data: { tokens: [] }
    }));

    await fetchAlchemyEvmWallets(['0x1', '0x2', '0x3']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).addresses).toHaveLength(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).addresses).toHaveLength(1);
  });

  it('fails when every requested network reports a partial error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: { tokens: [] },
      error: {
        message: 'Failed to fetch tokens on certain networks',
        partialErrors: [
          { network: 'eth-mainnet', message: 'Internal server error' },
          { network: 'arb-mainnet', message: 'Internal server error' }
        ]
      }
    }));

    await expect(fetchAlchemyEvmWallets(['0xabc']))
      .rejects.toThrow('All configured EVM networks failed');
  });
});
