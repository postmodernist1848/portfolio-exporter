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

Dashboard и API защищены HTTP Basic Auth для одного пользователя. Сохранённые
wallet-адреса и названия инвестиционных счетов отображаются без маскирования
после входа.

## Архитектура расширения

Новый источник добавляется без ломки старых данных:

1. Создайте новый класс в `src/lib/sources/`, реализующий `PortfolioSource`.
2. Зарегистрируйте его в `src/lib/sources/index.ts`.
3. Следующий snapshot начнет включать новый компонент.
4. Исторические графики старых источников продолжат работать, потому что история хранится по `sourceId`.

## Быстрый старт

```bash
npm ci
cp .env.example .env
# задайте PORTFOLIO_AUTH_USERNAME и PORTFOLIO_AUTH_PASSWORD в .env
npm run db:generate
npm run db:push
npm run dev
```

Приложение: `http://localhost:3000`

## Vercel + cron-job.org

Поддерживается Vercel с Node.js 24 и Fluid Compute. PostgreSQL должен быть
внешним и доступным из Vercel: Docker-адрес `db:5432` для этого не подходит.
Встроенный startup/hourly scheduler на Vercel автоматически отключается.
Рендер dashboard и GET API читают только БД.

1. Создайте PostgreSQL (например, Neon через Vercel Marketplace) и укажите
   `DATABASE_URL` с pooled connection string и TLS-настройками провайдера.
   Для Prisma schema-команд можно отдельно задать `DIRECT_URL` — прямую строку
   подключения к той же БД. Не используйте transaction pooler с idle transaction
   timeout меньше 300 секунд: сбор удерживает транзакционный advisory lock.
2. Импортируйте Git-репозиторий в Vercel, выберите Next.js, Node.js 24.x и
   включённый Fluid Compute. `vercel.json` задаёт `npm ci` и генерацию Prisma
   перед сборкой. Dockerfile на Vercel не используется.
3. Добавьте серверные переменные из `.env.example` в Production environment:
   `DATABASE_URL`, нужные ключи провайдеров и адреса кошельков. Не добавляйте
   префикс `NEXT_PUBLIC_` к секретам. Все три переменные OKX задаются вместе.
   Обязательно задайте `PORTFOLIO_AUTH_USERNAME` и длинный случайный
   `PORTFOLIO_AUTH_PASSWORD`: без обоих значений приложение закрывает dashboard
   и API ответом HTTP 503. Эти переменные проверяются во время запроса, а не
   встраиваются в клиентский bundle.
   Для Preview используйте отдельную БД и тестовые настройки, не production.

   Из корня связанного с Vercel репозитория credentials можно сгенерировать и
   записать в Production environment одной командой:

   ```bash
   npm run auth:vercel
   ```

   Команда выведет сгенерированный пароль один раз для переноса в настройки
   HTTP Authentication cron-job.org. Не сохраняйте вывод в логи или shell history.
4. Перед первым запуском подготовьте схему в выбранной БД: с соответствующими
   переменными подключения выполните `npm run db:generate` и `npm run db:push`.
   Команда build намеренно не меняет БД. Для переноса существующей истории
   сначала перенесите PostgreSQL backup в новую БД; пустая БД историю не получит.
5. После deployment проверьте `/api/health` и настройте cron-job.org:

   | Настройка | Значение |
   | --- | --- |
   | URL | `https://YOUR-PROJECT.vercel.app/api/collect?background=1` |
   | Advanced → Request method | `POST` |
   | Advanced → Authentication | HTTP Basic с `PORTFOLIO_AUTH_USERNAME` и `PORTFOLIO_AUTH_PASSWORD` |
   | Advanced → Headers | `Content-Type: application/json` |
   | Request body | `{}` |
   | Schedule | каждый час, `0 * * * *` |
   | Timezone | `Europe/Moscow` |
   | Save responses | по желанию; ответ содержит только `state` |

   Используйте HTTPS-адрес deployment без порта `:3000` и путь
   `/api/collect?background=1`. Endpoint принимает только авторизованный POST
   с JSON content type. Не помещайте логин или пароль в URL.
   Для self-hosted Docker с внешним cron задайте `SCHEDULER_ENABLED=false`.
   При переносе с Docker на Vercel отключите сбор на прежнем хосте
   после переключения production.

6. Запустите тест cron-job.org. Ожидаемый ответ: HTTP 202 `{"state":"accepted"}`.
   Это подтверждение принятия триггера, а не успешного сбора. Проверьте новый
   `capturedAt` и `status` в `/api/portfolio`, а также запись
   `[collection] background finished` в Vercel Logs. Поле `state` может быть
   `completed`, `in_progress` или `cooldown`. При ошибке callback пишет
   `[collection] background failed`; настройте контроль свежести snapshot,
   потому что cron-job.org не видит ошибку, случившуюся после ответа 202.

Сбор выполняется через Next.js `after`, который Vercel поддерживает после
отправки ответа, с `maxDuration=300`. Это помогает избежать стандартного
30-секундного timeout cron-job.org. Это не надёжная очередь: при остановке
функции потребуется следующий триггер. Незавершённый snapshot не записывается.
PostgreSQL advisory lock исключает параллельные сборы на разных экземплярах;
60-секундный cooldown также проверяется по сохранённому времени создания
snapshot. Потеря соединения/завершение транзакции освобождает lock.

`POST /api/collect` без параметра `background=1` возвращает результат
синхронно и используется кнопкой обновления на dashboard.
Endpoint повторно проверяет Basic Auth непосредственно перед запуском сбора,
даже несмотря на общую защиту приложения. cron-job.org хранит эти реквизиты в
настройках HTTP Authentication; ключи провайдеров ему не передаются.

Vercel Deployment Protection не требуется: встроенная защита приложения
работает и на Hobby production domain. Если дополнительно включить Deployment
Protection для deployment URL, cron потребуется отдельный automation bypass
header поверх Basic Auth.

Ссылки: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after),
[Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration),
[cron-job.org limits](https://cron-job.org/en/faq/).

## Docker Deploy

Один шаг для сборки и запуска:

```bash
cp .env.example .env
# задайте PORTFOLIO_AUTH_USERNAME и PORTFOLIO_AUTH_PASSWORD в .env
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
| EVM | `POST https://api.g.alchemy.com/data/v1/{key}/assets/tokens/by-address` | Нативные и ERC-20 балансы адреса в USD по Ethereum и Arbitrum |
| Solana SOL | `POST {SOLANA_RPC_URL}` с методом `getBalance` | Нативный баланс SOL |
| Solana USDC | `POST {SOLANA_RPC_URL}` с методом `getTokenAccountsByOwner` | Все SPL-счета основного USDC mint и их суммарный баланс |
| Цены и конвертация в RUB | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=rub,usd&include_last_updated_at=true` | BTC/RUB, BTC/USD, SOL/RUB и расчётный USD/RUB |

Solana RPC по умолчанию: `https://api.mainnet-beta.solana.com`. Его можно заменить
через `SOLANA_RPC_URL`. Используемый USDC mint:
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

Alchemy требует `ALCHEMY_API_KEY`. Адреса задаются в `BTC_ADDRESSES`,
`EVM_ADDRESSES`, `SOL_ADDRESSES` и `HYPERLIQUID_ADDRESSES`.

Implied USD/RUB рассчитывается как `bitcoin.rub / bitcoin.usd` и используется для
USDC, Alchemy и Hyperliquid. Проверяется время обновления цен; при временном сбое
используется последний успешный снимок с пометкой stale.

### Hyperliquid внутри крипто-портфеля

Все запросы отправляются методом `POST` на `https://api.hyperliquid.xyz/info`.
Для каждого адреса из `HYPERLIQUID_ADDRESSES` используются следующие значения
поля `type`:

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
`HYPERLIQUID_ADDRESSES` должен находиться master-адрес, а не agent/API wallet.

## Сбор данных

После запуска приложения сервер автоматически:

- сохраняет snapshot каждый час в круглое время (`00:00`, `01:00`, `02:00`, ...).
- сохраняет последнее успешное значение источника как устаревшее при временном сбое.
- запускает стартовый сбор только при отсутствии снимка или если снимок старше часа.

### Ручной триггер

- `POST /api/collect` с HTTP Basic Auth, `Content-Type: application/json` и телом `{}`

Одновременные запросы объединяются в один сбор; ручной запуск имеет cooldown 60 секунд.

## Эндпоинты

- `GET /api/health`
- `GET /api/portfolio`
- `GET /api/portfolio/history`
- `GET /api/portfolio/history/:sourceId`
- `POST /api/collect`

Все страницы и API требуют HTTP Basic Auth. Браузер запрашивает логин и пароль
при первом обращении к origin и повторно использует их для навигации и кнопки
«Обновить». Новый запрос появится после очистки/забывания credentials, смены
пароля или перехода на другой hostname deployment.

## Про исторические данные: оптимальный вариант

Текущий почасовой snapshot - правильный базовый подход для независимости от провайдеров. Для более оптимичной эксплуатации:

- Сохраняйте сырые snapshots раз в час (как сейчас).
- Добавьте агрегированные таблицы (`daily`, `weekly`) через materialized view или регулярную задачу.
- Для снижения нагрузки графики за длинный период строить из агрегатов, а недавний период - из сырых часов.
- Если нужен near real-time, добавьте отдельный lightweight-срез раз в 5-10 минут только для total.
