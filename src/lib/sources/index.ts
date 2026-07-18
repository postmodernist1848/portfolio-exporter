import { BcsSource } from './bcs';
import { CryptoSource } from './crypto';
import { OkxSource } from './okx';
import { TBankSource } from './tbank';
import type { PortfolioSource } from './types';

const registeredSources: PortfolioSource[] = [
  new CryptoSource(),
  new BcsSource(),
  new TBankSource(),
  new OkxSource()
];

export function getPortfolioSources(): readonly PortfolioSource[] {
  return registeredSources;
}
