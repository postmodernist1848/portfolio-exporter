import { z } from 'zod';

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalBoolean = z.preprocess(
  emptyToUndefined,
  z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true')
  ]).optional()
);

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@db:5432/portfolio_exporter'),
  BCS_REFRESH_TOKEN: optionalString,
  BCS_CLIENT_ID: z.enum(['trade-api-read', 'trade-api-write']).default('trade-api-read'),
  TINVEST_API_TOKEN: optionalString,
  TINVEST_ALLOW_SELF_SIGNED_TLS: optionalBoolean.default(false),
  OKX_API_BASE_URL: optionalUrl,
  OKX_API_KEY: optionalString,
  OKX_SECRET_KEY: optionalString,
  OKX_API_PASSPHRASE: optionalString,
  MORALIS_API_KEY: optionalString,
  BCS_ALLOW_SELF_SIGNED_TLS: optionalBoolean.default(false),
  BTC_ADDRESSES: optionalString,
  EVM_ADDRESSES: optionalString,
  ETH_ADDRESSES: optionalString,
  SOL_ADDRESSES: optionalString,
  SOLANA_RPC_URL: optionalUrl
}).superRefine((value, ctx) => {
  const okxValues = [value.OKX_API_KEY, value.OKX_SECRET_KEY, value.OKX_API_PASSPHRASE];
  if (okxValues.some(Boolean) && !okxValues.every(Boolean)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OKX_API_KEY'],
      message: 'OKX credentials must be configured together'
    });
  }
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BCS_REFRESH_TOKEN: process.env.BCS_REFRESH_TOKEN,
  BCS_CLIENT_ID: process.env.BCS_CLIENT_ID,
  TINVEST_API_TOKEN: process.env.TINVEST_API_TOKEN,
  TINVEST_ALLOW_SELF_SIGNED_TLS: process.env.TINVEST_ALLOW_SELF_SIGNED_TLS,
  OKX_API_BASE_URL: process.env.OKX_API_BASE_URL,
  OKX_API_KEY: process.env.OKX_API_KEY,
  OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
  OKX_API_PASSPHRASE: process.env.OKX_API_PASSPHRASE,
  MORALIS_API_KEY: process.env.MORALIS_API_KEY,
  BCS_ALLOW_SELF_SIGNED_TLS: process.env.BCS_ALLOW_SELF_SIGNED_TLS,
  BTC_ADDRESSES: process.env.BTC_ADDRESSES,
  EVM_ADDRESSES: process.env.EVM_ADDRESSES,
  ETH_ADDRESSES: process.env.ETH_ADDRESSES,
  SOL_ADDRESSES: process.env.SOL_ADDRESSES,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL
});
