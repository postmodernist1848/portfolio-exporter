# Portfolio Exporter: Codex Project Context

## Purpose and deployment model

- This is a public, single-user portfolio dashboard written in Russian.
- Stack: Next.js 16 App Router with Turbopack, React 19, TypeScript, Prisma 7, PostgreSQL,
  Recharts, Zod, Vitest, and Docker Compose.
- The application runs on one Docker host as an app container plus PostgreSQL.
- The application listens on port `3000`.
- Production deployment and database changes are external side effects. Perform
  them only when explicitly requested, preview destructive database selections
  before mutation, and verify the result afterward.

## Product invariants

- RUB is the only stored and displayed portfolio currency. Never add USD/EUR
  amounts to `totalRub` without an explicit, validated conversion.
- Dashboard rendering and `GET /api/portfolio` must be database-only. They must
  never call brokers, exchanges, RPC nodes, or price APIs.
- External providers are called only by the collection lifecycle: the hourly
  scheduler or public `POST /api/collect`.
- A temporary provider failure must not silently turn a previously known value
  into zero. The collection coordinator reuses the latest successful component
  with `status: stale`. Zero is only a placeholder when no successful value exists.
- Disabled sources are excluded from completeness claims. Supported component
  statuses are `ok`, `partial`, `stale`, `disabled`, and `error`.
- Historical rows without newer status fields remain readable as successful
  legacy data. Avoid destructive migrations or history loss.
- Public JSON and logs must not expose credentials, tokens, provider response
  bodies, raw provider payloads, or private account identifiers. Wallet addresses
  and investment account names are intentionally public in this application.
- UI timestamps are formatted for `Europe/Moscow` without appending the text
  `МСК`. PostgreSQL/ISO timestamps remain absolute UTC instants.
- Charts use real timestamps on the X axis and a padded data-derived Y domain;
  do not force the Y axis to start at zero. Keep accessible latest/min/max text.

## Architecture map

- `src/lib/sources/`: provider adapters. Each adapter owns authentication,
  requests, Zod validation, and normalization to RUB.
- `src/lib/sources/index.ts`: registered top-level sources.
- `src/lib/sources/metadata.ts`: source names, colors, ordering, and UI metadata.
- `src/lib/services/http.ts`: shared timeout, retry, jitter, `Retry-After`, safe
  structured logging, and narrowly scoped self-signed TLS handling.
- `src/lib/services/collection-coordinator.ts`: one shared in-flight collection,
  public cooldown, stale fallback, totals, counts, and overall snapshot status.
- `src/lib/services/scheduler.ts`: startup freshness check and hourly aligned run.
- `src/lib/db/portfolio-repository.ts`: persistence, legacy compatibility, latest
  successful component lookup, and chronological bounded history queries.
- `src/lib/services/portfolio-service.ts`: read-only dashboard view model,
  freshness, source ordering, breakdowns, and changes from the previous snapshot.
- `src/app/page.tsx`: server-rendered dashboard.
- `src/components/source-breakdown.tsx`: persisted latest-snapshot details; it must
  not fetch providers while rendering.
- `src/components/line-chart.tsx`: time-scaled portfolio charts.
- `src/app/api/`: public collection, health, portfolio, and history endpoints.
- `src/types/portfolio.ts`: shared persisted and public DTOs.
- `prisma/schema.prisma`: snapshots and cascading source components.

## Collection and persistence semantics

- `PortfolioSnapshot.totalRub` is the sum of all component `totalRub` values,
  including deliberately preserved stale values.
- `observedAt` is when a source value was successfully observed; `capturedAt` is
  when the aggregate snapshot was created. Preserve this distinction.
- Manual and scheduled triggers must share the coordinator so provider fetches
  cannot overlap. The public manual refresh cooldown is 60 seconds.
- The scheduler runs at startup only if no snapshot exists or the latest is at
  least one hour old, then aligns collections to clock hours.
- Snapshot details contain sanitized current breakdowns. Historical charts only
  require totals, but existing details may remain stored.
- History queries select newest rows with a bounded limit, then reverse them for
  chronological chart order. Supported ranges are `24h`, `7d`, `30d`, and `all`.
- Prisma snapshot components use `onDelete: Cascade`. When deleting data for a
  human-readable inclusive second, remember stored timestamps can contain
  milliseconds; prefer a half-open upper bound at the following second.

## Provider-specific rules

### Crypto

- `BTC_ADDRESSES`: Blockstream address state. BTC balance is funded minus spent
  transaction outputs.
- `EVM_ADDRESSES`: Alchemy Portfolio API for native and ERC-20 balances on exactly
  Ethereum and Arbitrum. Alchemy failure or missing configuration must not
  disable BTC, Solana, or Hyperliquid collection.
- `SOL_ADDRESSES`: Solana JSON-RPC native SOL plus all accounts for the mainnet
  USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- `HYPERLIQUID_ADDRESSES`: separate Hyperliquid master addresses, never inferred
  from `EVM_ADDRESSES`. Discover subaccounts automatically; do not use agent/API
  wallet addresses.
- Crypto subcomponents run independently with `Promise.allSettled` semantics.
- CoinGecko supplies BTC/RUB, BTC/USD, and SOL/RUB in one timestamped snapshot.
  Implied USD/RUB is `bitcoin.rub / bitcoin.usd` and converts Alchemy,
  Hyperliquid, and Solana USDC values. Preserve last-known-good prices as stale.
- Hyperliquid final value comes from the latest normal `day.accountValueHistory`
  point returned by `type: portfolio`. Spot, perpetual, vault, staking, mode, and
  subaccount calls are diagnostic breakdowns and must not be manually added on
  top of that official portfolio value.

### Brokers and exchange

- T-Invest first lists open accounts, then fetches each portfolio independently
  in RUB. `ACCOUNT_TYPE_DFA` uses `totalAmountDfa`. The account named `Кредитка`
  is intentionally excluded and described in source metadata.
- BCS stores sanitized aggregate/position diagnostics only, never the raw payload.
  A valid zero or negative total is not equivalent to a missing value.
- OKX uses the signed read-only Asset Valuation endpoint with `ccy=RUB` and its
  `totalBal`. All three OKX credential variables must be configured together.
- Self-signed TLS exceptions are provider-specific only. Never set global
  `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Adding or changing a source

1. Implement `PortfolioSource` in `src/lib/sources/` and validate every external
   response with Zod.
2. Add the source ID and DTO/breakdown types in `src/types/portfolio.ts`.
3. Register the adapter in `src/lib/sources/index.ts` and display metadata in
   `src/lib/sources/metadata.ts`.
4. Add rendering to the centralized breakdown component when applicable.
5. Add provider fixtures and collection/repository/UI tests as appropriate.
6. Update `.env.example`, `docker-compose.yml`, and the README API map if the
   provider or configuration surface changes.

## Development and verification

- Install reproducibly with `npm ci`; Docker builds also use `npm ci`.
- Common commands:
  - `npm run dev` — local server on port 3000
  - `npm run check` — lint, TypeScript, and all Vitest tests
  - `npm run build` — production Next.js build
  - `docker compose config --quiet` — validate Compose interpolation
- Before handing off an implementation, normally run `npm run check`,
  `npm run build`, `docker compose config --quiet`, and `git diff --check`.
- Local shell credentials can make tests fail during env parsing if only part of
  the OKX credential group is set. For a credential-free test run, explicitly
  clear `OKX_API_KEY`, `OKX_SECRET_KEY`, and `OKX_API_PASSPHRASE` together.
- Tests must not call real providers. Mock `fetch` and use validated fixtures.
- Preserve unrelated user changes in a dirty worktree. In particular, inspect
  `git status` before editing or committing and stage only files in scope.

## Operations and safety

- Never commit `.env`, database data, logs, build archives, account tokens, or
  credentials.
- Do not log successful response bodies. Log provider, operation, status,
  duration, attempt, and generated request ID only.
- Retry only network failures, HTTP 408/429, and 5xx responses. Do not retry
  authentication or validation failures.
- Database maintenance on production should follow: timezone-aware `SELECT`
  preview, narrowly scoped transaction, reported affected-row count, and a final
  verification query.
- Do not deploy, mutate production data, or rewrite Git history unless the user
  explicitly requests that action.
