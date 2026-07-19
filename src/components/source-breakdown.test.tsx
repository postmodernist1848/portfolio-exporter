// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceBreakdownView } from './source-breakdown';

afterEach(cleanup);

describe('source breakdown', () => {
  it('shows crypto providers, public addresses, and calculated values', () => {
    render(<SourceBreakdownView breakdown={{
      kind: 'crypto',
      btc: {
        priceRub: 5_000_000,
        wallets: [{
          address: 'bc1q-public-address',
          balanceBtc: 0.1,
          totalRub: 500_000
        }]
      },
      evm: {
        usdRubRate: 80,
        rateStale: false,
        wallets: [{
          address: '0xpublic',
          totalUsd: 100,
          totalRub: 8_000,
          chains: [
            { chain: 'eth', totalUsd: 40 },
            { chain: 'arbitrum', totalUsd: 60 }
          ],
          unsupportedChains: [],
          unavailableChains: []
        }]
      }
    }} />);

    expect(screen.getByText('Blockstream API', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Moralis Wallet Net Worth', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('bc1q-public-address')).toBeInTheDocument();
    expect(screen.getByText('0xpublic')).toBeInTheDocument();
    expect(screen.getByText('Arbitrum:', { exact: false })).toBeInTheDocument();
  });

  it('shows every T-Bank account and an intentional exclusion', () => {
    render(<SourceBreakdownView breakdown={{
      kind: 'tbank',
      accounts: [{
        name: 'Основной',
        type: 'ACCOUNT_TYPE_TINKOFF',
        totalRub: 100,
        positionsCount: 2,
        status: 'ok'
      }, {
        name: 'Смарт-счёт',
        type: 'ACCOUNT_TYPE_DFA',
        totalRub: 50,
        positionsCount: 1,
        status: 'ok'
      }],
      excludedAccounts: [{
        name: 'Кредитка',
        reason: 'Исключён из инвестиционного портфеля'
      }]
    }} />);

    expect(screen.getByText('Основной')).toBeInTheDocument();
    expect(screen.getAllByText('Смарт-счёт')).toHaveLength(2);
    expect(screen.getByText('Кредитка', { exact: false })).toBeInTheDocument();
  });
});
