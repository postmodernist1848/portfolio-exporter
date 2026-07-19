import type { SourceBreakdown } from '@/types/portfolio';

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2
});
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 });
const usd = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});
const evmChainLabels: Record<string, string> = {
  eth: 'Ethereum',
  arbitrum: 'Arbitrum'
};

function CryptoDetails({ breakdown }: { breakdown: Extract<SourceBreakdown, { kind: 'crypto' }> }) {
  return (
    <div className="breakdown-stack">
      {breakdown.btc && (
        <section className="breakdown-group">
          <div className="breakdown-heading">
            <div><h4>Bitcoin</h4><p>Баланс адреса через Blockstream API</p></div>
            <span>BTC/RUB: {rub.format(breakdown.btc.priceRub)}</span>
          </div>
          <div className="table-scroll">
            <table className="breakdown-table">
              <thead><tr><th>Адрес</th><th>BTC</th><th>Стоимость</th></tr></thead>
              <tbody>{breakdown.btc.wallets.map((wallet) => (
                <tr key={wallet.address}>
                  <td className="address-cell">{wallet.address}</td>
                  <td>{number.format(wallet.balanceBtc)}</td>
                  <td>{rub.format(wallet.totalRub)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {breakdown.evm && (
        <section className="breakdown-group">
          <div className="breakdown-heading">
            <div>
              <h4>EVM</h4>
              <p>Moralis Wallet Net Worth: Ethereum + Arbitrum, spam и непроверенные контракты исключены</p>
            </div>
            <span>USD/RUB: {number.format(breakdown.evm.usdRubRate)}{breakdown.evm.rateStale ? ' · устарел' : ''}</span>
          </div>
          <div className="table-scroll">
            <table className="breakdown-table">
              <thead><tr><th>Адрес</th><th>По сетям</th><th>Оценка Moralis</th><th>Стоимость</th></tr></thead>
              <tbody>{breakdown.evm.wallets.map((wallet) => (
                <tr key={wallet.address}>
                  <td className="address-cell">{wallet.address}</td>
                  <td>
                    {(['eth', 'arbitrum'] as const).map((chain) => {
                      const value = wallet.chains?.find((item) => item.chain === chain)?.totalUsd ?? 0;
                      return <small className="chain-value" key={chain}>{evmChainLabels[chain]}: {usd.format(value)}</small>;
                    })}
                    {(wallet.unavailableChains?.length ?? 0) > 0 && (
                      <small className="error-text">Недоступны: {wallet.unavailableChains.join(', ')}</small>
                    )}
                    {(wallet.unsupportedChains?.length ?? 0) > 0 && (
                      <small className="error-text">Не поддерживаются: {wallet.unsupportedChains.join(', ')}</small>
                    )}
                  </td>
                  <td>{usd.format(wallet.totalUsd)}</td>
                  <td>{rub.format(wallet.totalRub)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {breakdown.solana && (
        <section className="breakdown-group">
          <div className="breakdown-heading">
            <div>
              <h4>Solana</h4>
              <p>Solana JSON-RPC: нативный SOL и USDC основного mainnet mint</p>
            </div>
            <span>SOL/RUB: {rub.format(breakdown.solana.solPriceRub)}</span>
          </div>
          <div className="table-scroll">
            <table className="breakdown-table">
              <thead>
                <tr><th>Адрес</th><th>SOL</th><th>SOL, ₽</th><th>USDC</th><th>USDC, ₽</th><th>Всего</th></tr>
              </thead>
              <tbody>{breakdown.solana.wallets.map((wallet) => (
                <tr key={wallet.address}>
                  <td className="address-cell">{wallet.address}</td>
                  <td>{number.format(wallet.balanceSol)}</td>
                  <td>{rub.format(wallet.solRub)}</td>
                  <td>{number.format(wallet.balanceUsdc)}</td>
                  <td>{rub.format(wallet.usdcRub)}</td>
                  <td>{rub.format(wallet.totalRub)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="breakdown-note">
            Цена SOL — CoinGecko. USDC конвертируется по implied USD/RUB: {number.format(breakdown.solana.usdRubRate)}
            {breakdown.solana.rateStale ? ' (использован последний известный снимок цен)' : ''}.
          </p>
        </section>
      )}

      {breakdown.hyperliquid && (
        <section className="breakdown-group">
          <div className="breakdown-heading">
            <div>
              <h4>Hyperliquid</h4>
              <p>Официальный Hyperliquid Info API: HyperCore spot, perpetuals, vaults, staking и subaccounts</p>
            </div>
            <span>
              USD/RUB: {number.format(breakdown.hyperliquid.usdRubRate)}
              {breakdown.hyperliquid.rateStale ? ' · устарел' : ''}
            </span>
          </div>
          {breakdown.hyperliquid.wallets.map((wallet) => (
            <details className="account-details" open key={wallet.address}>
              <summary>
                <span className="address-cell">{wallet.address}</span>
                <span>{usd.format(wallet.totalUsd)} · {rub.format(wallet.totalRub)}</span>
              </summary>
              <div className="table-scroll">
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Аккаунт</th><th>Режим</th><th>Perpetuals</th><th>Spot</th>
                      <th>Vaults</th><th>Staking</th><th>Всего</th>
                    </tr>
                  </thead>
                  <tbody>{wallet.accounts.map((account) => (
                    <tr key={account.address}>
                      <td>
                        <strong>{account.name}</strong>
                        <small className="address-cell">{account.address}</small>
                        {account.spotBalances.filter((balance) => balance.balance !== 0).map((balance) => (
                          <small className="chain-value" key={`${account.address}-${balance.coin}`}>
                            {balance.coin}: {number.format(balance.balance)}
                            {balance.totalUsd === null ? ' · нет цены' : ` · ${usd.format(balance.totalUsd)}`}
                          </small>
                        ))}
                        {account.unpricedCoins.length > 0 && (
                          <small className="error-text">
                            Нет отдельной цены для разбивки: {account.unpricedCoins.join(', ')}
                          </small>
                        )}
                      </td>
                      <td>{account.mode}</td>
                      <td>{usd.format(account.perpetualsUsd)}</td>
                      <td>{usd.format(account.spotUsd)}</td>
                      <td>{usd.format(account.vaultsUsd)}</td>
                      <td>{usd.format(account.stakingUsd)}</td>
                      <td>
                        {usd.format(account.totalUsd)}
                        <small>Portfolio API</small>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          ))}
          <p className="breakdown-note">
            Итог берётся из последней точки `accountValueHistory` официального Portfolio API.
            Остальные колонки показаны для диагностики и не суммируются вручную; поэтому UBTC/UETH
            входят в итог даже когда отдельная цена для разбивки недоступна.
          </p>
        </section>
      )}
    </div>
  );
}

const accountTypeLabels: Record<string, string> = {
  ACCOUNT_TYPE_TINKOFF: 'Брокерский',
  ACCOUNT_TYPE_TINKOFF_IIS: 'ИИС',
  ACCOUNT_TYPE_INVEST_BOX: 'Инвесткопилка',
  ACCOUNT_TYPE_INVEST_FUND: 'Фонд денежного рынка',
  ACCOUNT_TYPE_DFA: 'Смарт-счёт'
};

function TBankDetails({ breakdown }: { breakdown: Extract<SourceBreakdown, { kind: 'tbank' }> }) {
  return (
    <div className="breakdown-stack">
      <section className="breakdown-group">
        <div className="breakdown-heading">
          <div><h4>Счета</h4><p>Итог `GetPortfolio` по каждому открытому инвестиционному счёту</p></div>
        </div>
        <div className="table-scroll">
          <table className="breakdown-table">
            <thead><tr><th>Название</th><th>Тип</th><th>Позиций</th><th>Статус</th><th>Стоимость</th></tr></thead>
            <tbody>{breakdown.accounts.map((account, index) => (
              <tr key={`${account.name}-${index}`}>
                <td>{account.name}</td>
                <td>{accountTypeLabels[account.type] ?? account.type}</td>
                <td>{account.positionsCount}</td>
                <td>{account.status === 'ok' ? 'Получен' : account.errorMessage}</td>
                <td>{account.totalRub === null ? '—' : rub.format(account.totalRub)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {breakdown.excludedAccounts.length > 0 && (
        <p className="breakdown-note">
          Не учитывается: {breakdown.excludedAccounts.map((account) => `${account.name} — ${account.reason}`).join('; ')}.
        </p>
      )}
    </div>
  );
}

function BcsDetails({ breakdown }: { breakdown: Extract<SourceBreakdown, { kind: 'bcs' }> }) {
  if (breakdown.accounts.length === 0) {
    return <p className="breakdown-note">API вернул только агрегированный итог без разбивки по позициям.</p>;
  }
  return (
    <div className="breakdown-stack">
      {breakdown.accounts.map((account) => (
        <details className="account-details" open={breakdown.accounts.length === 1} key={account.account}>
          <summary>
            <span>{account.account}</span>
            <span>{account.positions.length} поз. · {rub.format(account.totalRub)}</span>
          </summary>
          <div className="table-scroll">
            <table className="breakdown-table">
              <thead><tr><th>Инструмент</th><th>Тип</th><th>Количество</th><th>Стоимость</th></tr></thead>
              <tbody>{account.positions.map((position, index) => (
                <tr key={`${position.ticker}-${index}`}>
                  <td><strong>{position.ticker}</strong>{position.name && <small>{position.name}</small>}</td>
                  <td>{position.instrumentType ?? '—'}</td>
                  <td>{position.quantity === undefined ? '—' : number.format(position.quantity)}</td>
                  <td>{rub.format(position.totalRub)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      ))}
      <p className="breakdown-note">Метод расчёта: {breakdown.calculationMethod}.</p>
    </div>
  );
}

function OkxDetails({ breakdown }: { breakdown: Extract<SourceBreakdown, { kind: 'okx' }> }) {
  if (breakdown.categories.length === 0) {
    return <p className="breakdown-note">OKX Asset Valuation вернул только общую оценку аккаунта в RUB.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="breakdown-table">
        <thead><tr><th>Категория OKX</th><th>Стоимость</th></tr></thead>
        <tbody>{breakdown.categories.map((category) => (
          <tr key={category.name}><td>{category.name}</td><td>{rub.format(category.totalRub)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function SourceBreakdownView({ breakdown }: { breakdown?: SourceBreakdown }) {
  if (!breakdown) {
    return <p className="breakdown-note">Для этого snapshot детальная разбивка ещё не сохранена.</p>;
  }
  if (breakdown.kind === 'crypto') return <CryptoDetails breakdown={breakdown} />;
  if (breakdown.kind === 'tbank') return <TBankDetails breakdown={breakdown} />;
  if (breakdown.kind === 'bcs') return <BcsDetails breakdown={breakdown} />;
  return <OkxDetails breakdown={breakdown} />;
}
