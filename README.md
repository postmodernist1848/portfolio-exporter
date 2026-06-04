# Portfolio Exporter

Минималистичное standalone-приложение на Next.js для отображения стоимости портфеля на русском языке.

## Что уже реализовано

- Общая стоимость портфеля и компоненты:
  - Крипто (BTC/ETH/SOL по адресам)
  - БКС Мир Инвестиций (через API)
  - Т Инвестиции (через API)
- Исторические snapshots в PostgreSQL.
- Серверный рендер dashboard из БД.
- Встроенная в приложение почасовая джоба сбора данных.
- API для ручного триггера сбора.
- Графики общей стоимости и по каждому источнику.

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
- Приложение суммирует все открытые счета последовательно и игнорирует счет с названием `Кредитка`.
- Нужны переменные:
  - `TINVEST_API_TOKEN`
  - `TINVEST_PORTFOLIO_CURRENCY` (`RUB`/`USD`/`EUR`)

Официальная документация:

- БКС: `https://trade-api.bcs.ru/http/authorization/`, `https://trade-api.bcs.ru/http/portfolio/`
- Т-Банк: `https://developer.tbank.ru/invest/api/operations-service-get-portfolio`

### Крипто

- Обязательная переменная: `MORALIS_API_KEY`.
- EVM адреса считаются через Moralis Wallet Net Worth API (native assets + токены).
- BTC считается отдельно on-chain.
- Solana считается только как native SOL через public RPC и цену SOL/RUB.
- В snapshot сохраняется итоговая фиатная стоимость.

## Сбор данных

После запуска приложения сервер автоматически:

- сохраняет snapshot каждый час в круглое время (`00:00`, `01:00`, `02:00`, ...).

### Ручной триггер

- `POST /api/collect`

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
