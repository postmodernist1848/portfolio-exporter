# Portfolio Exporter

Минималистичное standalone-приложение на Next.js для отображения стоимости портфеля на русском языке.

## Что уже реализовано

- Общая стоимость портфеля и компоненты:
  - Крипто (BTC/ETH/SOL по адресам)
  - БКС Мир Инвестиций (через API)
  - Т Инвестиции (через API)
  - OKX (общая стоимость аккаунта через API)
- Исторические snapshots в PostgreSQL.
- Серверный рендер dashboard только из БД, без запросов к провайдерам.
- Встроенная в приложение почасовая джоба сбора данных.
- API для ручного триггера сбора.
- Графики общей стоимости и по каждому источнику.
- Детализация последнего snapshot без дополнительных API-запросов:
  - Crypto по публичным адресам и активам BTC/EVM/SOL/USDC.
  - T-Invest по открытым счетам.
  - БКС по счетам и дедуплицированным позициям.
  - OKX по категориям, если их возвращает Asset Valuation API.

Dashboard публичный: сохранённые wallet-адреса и названия инвестиционных счетов отображаются без маскирования.

## Архитектура расширения

Новый источник добавляется без ломки старых данных:

1. Создайте новый класс в `src/lib/sources/`, реализующий `PortfolioSource`.
2. Зарегистрируйте его в `src/lib/sources/index.ts`.
3. Следующий snapshot начнет включать новый компонент.
4. Исторические графики старых источников продолжат работать, потому что история хранится по `sourceId`.

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

Приложение: `http://localhost:3000`

## Docker Deploy

Один шаг для сборки и запуска:

```bash
cp .env.example .env
docker compose up -d
```

После запуска:

- Приложение доступно на `http://localhost:3000`.
- `PostgreSQL` поднимается в отдельном контейнере.
- Отдельный контейнер `migrate` автоматически выполняет `prisma db push`, после этого стартует `app`.

Секреты и настройки задаются только в `.env`, а `docker-compose.yml` использует подстановки `${...}`.

## Remote Deploy

Основной деплой собирает Docker-образы локально, отправляет их на сервер и запускает compose без сборки на сервере:

```bash
make deploy
```

Старый режим со сборкой на сервере оставлен отдельно:

```bash
make deploy-build-remote
```

Проверка:

```bash
make status
make logs
```

## API-интеграции

Все внешние запросы выполняются только во время сбора snapshot. Загрузка страницы и
`GET /api/portfolio` читают уже сохранённые данные из PostgreSQL.

### БКС Мир Инвестиций

| Назначение | Endpoint | Использование |
| --- | --- | --- |
| Access token | `POST https://be.broker.ru/trade-api-keycloak/realms/tradeapi/protocol/openid-connect/token` | Обмен `BCS_REFRESH_TOKEN` на временный access token |
| Портфель | `GET https://be.broker.ru/trade-api-bff-portfolio/api/v1/portfolio` | Общая стоимость в RUB и доступная разбивка по счетам и позициям |

Конфигурация: `BCS_REFRESH_TOKEN`, `BCS_CLIENT_ID`. Опция
`BCS_ALLOW_SELF_SIGNED_TLS` действует только на запросы БКС.

### Т Инвестиции

| Назначение | Endpoint | Использование |
| --- | --- | --- |
| Список счетов | `POST https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts` | Открытые инвестиционные счета |
| Портфель счёта | `POST https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio` | `totalAmountPortfolio` в RUB; для DFA — `totalAmountDfa` |

Запрос портфеля выполняется отдельно для каждого счёта. Конфигурация:
`TINVEST_API_TOKEN`. Опция `TINVEST_ALLOW_SELF_SIGNED_TLS` действует только на
T-Invest.

### OKX

| Назначение | Endpoint | Использование |
| --- | --- | --- |
| Оценка аккаунта | `GET https://www.okx.com/api/v5/asset/asset-valuation?ccy=RUB` | `totalBal` — готовая общая стоимость аккаунта в RUB; `details` — справочная разбивка |

Endpoint подписывается read-only API-ключом. Конфигурация: `OKX_API_KEY`,
`OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`. Домен можно заменить через
`OKX_API_BASE_URL`.

### Крипто-портфель

| Секция | Endpoint | Использование |
| --- | --- | --- |
| Bitcoin | `GET https://blockstream.info/api/address/{address}` | On-chain баланс BTC: `funded_txo_sum - spent_txo_sum` |
| EVM | `GET https://deep-index.moralis.io/api/v2.2/wallets/{address}/net-worth?chains[0]=eth&chains[1]=arbitrum&exclude_spam=true&exclude_unverified_contracts=true` | Net worth адреса в USD по Ethereum и Arbitrum |
| Solana SOL | `POST {SOLANA_RPC_URL}` с методом `getBalance` | Нативный баланс SOL |
| Solana USDC | `POST {SOLANA_RPC_URL}` с методом `getTokenAccountsByOwner` | Все SPL-счета основного USDC mint и их суммарный баланс |
| Цены и конвертация в RUB | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=rub,usd&include_last_updated_at=true` | BTC/RUB, BTC/USD, SOL/RUB и расчётный USD/RUB |

Solana RPC по умолчанию: `https://api.mainnet-beta.solana.com`. Его можно заменить
через `SOLANA_RPC_URL`. Используемый USDC mint:
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

Moralis требует `MORALIS_API_KEY`. Адреса задаются в `BTC_ADDRESSES`,
`EVM_ADDRESSES` и `SOL_ADDRESSES`.

Implied USD/RUB рассчитывается как `bitcoin.rub / bitcoin.usd` и используется для
USDC, Moralis и Hyperliquid. Проверяется время обновления цен; при временном сбое
используется последний успешный снимок с пометкой stale.

### Hyperliquid внутри крипто-портфеля

Все запросы отправляются методом `POST` на `https://api.hyperliquid.xyz/info`.
Для каждого адреса из `EVM_ADDRESSES` используются следующие значения поля `type`:

| `type` | Использование |
| --- | --- |
| `portfolio` | Итоговая USD-стоимость: последняя точка обычной серии `day.accountValueHistory` |
| `subAccounts` | Поиск subaccounts master-адреса; их портфели прибавляются к итогу |
| `spotMetaAndAssetCtxs` | Метаданные и цены spot-активов для справочной разбивки |
| `spotClearinghouseState` | Spot-балансы аккаунта |
| `clearinghouseState` | Perpetual account value |
| `userAbstraction` | Определение standard, unified account или portfolio margin |
| `userVaultEquities` | Вложения пользователя в vaults |
| `delegatorSummary` | Делегированный и ожидающий вывода HYPE |

В итог входит только значение `portfolio`; остальные ответы сохраняются для
прозрачной разбивки и не суммируются повторно. API-ключ не нужен. В
`EVM_ADDRESSES` должен находиться master-адрес, а не agent/API wallet.

## Сбор данных

После запуска приложения сервер автоматически:

- сохраняет snapshot каждый час в круглое время (`00:00`, `01:00`, `02:00`, ...).
- сохраняет последнее успешное значение источника как устаревшее при временном сбое.
- запускает стартовый сбор только при отсутствии снимка или если снимок старше часа.

### Ручной триггер

- `POST /api/collect`

Одновременные запросы объединяются в один сбор; публичный ручной запуск имеет cooldown 60 секунд.

## Эндпоинты

- `GET /api/health`
- `GET /api/portfolio`
- `GET /api/portfolio/history`
- `GET /api/portfolio/history/:sourceId`
- `POST /api/collect`

## Про исторические данные: оптимальный вариант

Текущий почасовой snapshot - правильный базовый подход для независимости от провайдеров. Для более оптимичной эксплуатации:

- Сохраняйте сырые snapshots раз в час (как сейчас).
- Добавьте агрегированные таблицы (`daily`, `weekly`) через materialized view или регулярную задачу.
- Для снижения нагрузки графики за длинный период строить из агрегатов, а недавний период - из сырых часов.
- Если нужен near real-time, добавьте отдельный lightweight-срез раз в 5-10 минут только для total.
