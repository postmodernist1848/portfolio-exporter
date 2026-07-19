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

## Реальные API интеграции

### БКС Мир Инвестиций

- Авторизация: `POST https://be.broker.ru/trade-api-keycloak/realms/tradeapi/protocol/openid-connect/token`
- Портфель: `GET https://be.broker.ru/trade-api-bff-portfolio/api/v1/portfolio`
- Нужны переменные:
  - `BCS_REFRESH_TOKEN` (из кабинета БКС)
  - `BCS_CLIENT_ID` (`trade-api-read` или `trade-api-write`, обычно `trade-api-read`)

### Т Инвестиции (T-Invest API)

- Портфель: `POST https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio`
- Счета: `POST https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts`
- Приложение суммирует открытые счета в RUB независимо; сбой одного счета даёт частичный результат.
- Нужны переменные:
  - `TINVEST_API_TOKEN`
  - `TINVEST_ALLOW_SELF_SIGNED_TLS` — отключает проверку сертификата только для T-Invest; в Docker по запросу включено по умолчанию.

Официальная документация:

- БКС: `https://trade-api.bcs.ru/http/authorization/`, `https://trade-api.bcs.ru/http/portfolio/`
- Т-Банк: `https://developer.tbank.ru/invest/api/operations-service-get-portfolio`

### OKX

- Используется приватный read-only endpoint `GET /api/v5/asset/asset-valuation?ccy=RUB`.
- В портфель попадает поле `totalBal` — общая стоимость аккаунта уже в RUB, включая funding, trading и Earn-балансы.
- Для региональных API-доменов можно переопределить `OKX_API_BASE_URL`.
- Для API-ключа достаточно разрешения `Read`; торговые и withdrawal-разрешения не нужны.
- Нужны переменные:
  - `OKX_API_KEY`
  - `OKX_SECRET_KEY`
  - `OKX_API_PASSPHRASE`
- Запрос подписывается HMAC-SHA256 с Base64-кодированием по схеме OKX.

Документация OKX: `https://www.okx.com/docs-v5/en/`

### Крипто

- `MORALIS_API_KEY` требуется только для EVM-адресов; BTC и Solana работают без него.
- EVM-адреса из `EVM_ADDRESSES` считаются через Moralis Wallet Net Worth API
  одновременно по сетям Ethereum и Arbitrum (native assets + токены).
- BTC считается отдельно on-chain.
- Solana считается как native SOL и SPL USDC через Solana JSON-RPC и цену SOL/RUB.
- Каждый адрес из `EVM_ADDRESSES` также проверяется через публичный официальный
  Hyperliquid Info API без API-ключа. Учитываются HyperCore spot, perpetual
  account value, vault deposits, staking HYPE и subaccounts.
- Для unified account и portfolio margin источником истины служит spot state:
  perpetual account value в этих режимах повторно не прибавляется.
- Итог Hyperliquid берётся из последней точки обычной серии `accountValueHistory`
  endpoint `portfolio`. Детальные spot/perpetual/vault/staking значения сохраняются
  для диагностики, но не складываются вручную и не влияют на официальный итог.
- Для Hyperliquid нужно указывать в `EVM_ADDRESSES` master account, а не agent/API
  wallet; subaccounts обнаруживаются автоматически.
- Для SPL USDC используется mainnet mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- RPC endpoint можно переопределить через `SOLANA_RPC_URL`.
- В snapshot сохраняется итоговая фиатная стоимость.

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
