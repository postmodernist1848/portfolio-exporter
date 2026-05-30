import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@db:5432/portfolio_exporter'),
  BCS_REFRESH_TOKEN: z.string().optional(),
  BCS_CLIENT_ID: z.enum(['trade-api-read', 'trade-api-write']).default('trade-api-read'),
  TINVEST_API_TOKEN: z.string().optional(),
  TINVEST_PORTFOLIO_CURRENCY: z.enum(['RUB', 'USD', 'EUR']).default('RUB'),
  MORALIS_API_KEY: z.string().optional(),
  ALLOW_SELF_SIGNED_TLS: z.string().optional(),
  BTC_ADDRESSES: z.string().optional(),
  ETH_ADDRESSES: z.string().optional(),
  SOL_ADDRESSES: z.string().optional(),
  CRYPTO_FIAT: z.string().default('rub')
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BCS_REFRESH_TOKEN: process.env.BCS_REFRESH_TOKEN,
  BCS_CLIENT_ID: process.env.BCS_CLIENT_ID,
  TINVEST_API_TOKEN: process.env.TINVEST_API_TOKEN,
  TINVEST_PORTFOLIO_CURRENCY: process.env.TINVEST_PORTFOLIO_CURRENCY,
  MORALIS_API_KEY: process.env.MORALIS_API_KEY,
  ALLOW_SELF_SIGNED_TLS: process.env.ALLOW_SELF_SIGNED_TLS,
  BTC_ADDRESSES: process.env.BTC_ADDRESSES,
  ETH_ADDRESSES: process.env.ETH_ADDRESSES,
  SOL_ADDRESSES: process.env.SOL_ADDRESSES,
  CRYPTO_FIAT: process.env.CRYPTO_FIAT
});
