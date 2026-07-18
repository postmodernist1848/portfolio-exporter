import { describe, expect, it } from 'vitest';
import { isPortfolioSourceId, PORTFOLIO_SOURCE_IDS, SOURCE_METADATA } from './metadata';

describe('source registry', () => {
  it('contains stable metadata for every public source ID', () => {
    expect(PORTFOLIO_SOURCE_IDS).toEqual(['crypto', 'bcs', 'tbank', 'okx']);
    expect(PORTFOLIO_SOURCE_IDS.every((id) => SOURCE_METADATA[id].name && SOURCE_METADATA[id].color)).toBe(true);
  });

  it('rejects arbitrary history source IDs', () => {
    expect(isPortfolioSourceId('crypto')).toBe(true);
    expect(isPortfolioSourceId('wallet-address')).toBe(false);
  });
});
