# Bitcoin cost basis

Updated **14 November 2026**, public history checked at **16:16 Europe/Moscow**.
[Repeatable research instructions](../README.md) · [Trades and transfers](trades-summary.md) · [Hedge analysis](hedge-analysis.md)

## Current result

The four user-confirmed Bitcoin addresses hold **0.12736999 BTC**, all at the main
cold address `bc1q45v5f5gq2rdrek3n9qkn8g85h6eq80r2m99jn7`. Both tracked HL accounts
have zero UBTC and no discovered subaccounts. The other three owned Bitcoin addresses
are empty; retain them in the ownership registry for historical reconciliation.

| Moving weighted-average model | Transfer fees expensed | Identified transfer fees capitalized |
|---|---:|---:|
| Physical purchases, average USDT/BTC | **71,467.00** | **71,517.88** |
| Physical remaining basis, USDT | 9,102.75 | 9,109.23 |
| Both OKX hedges as synthetic sells/rebuys, average USDT/BTC | **75,243.72** | **75,282.64** |
| Both hedges, remaining modeled basis, USDT | 9,583.79 | 9,588.75 |

These are approximate equivalents assuming **1 USDC = 1 USDT**, excluding unvalued
gas. Native quote components remain separate in the calculations. The dashboard
uses the both-hedges, capitalized-fees average with funding recognized separately;
it additionally assumes USD parity for RUB conversion. No production collection,
database mutation or deployment was performed for this update.

## Latest activity

The [13 November HL withdrawal](https://blockstream.info/tx/538993415c7d47a32d56957e6cb273a5ef5fad45687bc9cfc25543597a7b3eff)
was already included in the previous research: **0.02582844 BTC** received at 23:46:21
Moscow time from **0.0258330811 UBTC** debited. The difference is **0.0000046411 BTC**.
It combines four HL buys costing **799.139440 USDC** (0.0112247011 BTC net) and an
Across acquisition of **0.01460838 UBTC for 1,008.60 USDT**. The source Polygon debit,
Across fill and HyperEVM-to-HyperCore credit are in `artifacts/external-acquisitions.json`.
Do not add the withdrawal as a second purchase.

The [14 November consolidation](https://blockstream.info/tx/639ea185f678c76ec940b518c44e5aeaf83b11aa663c28f0c9bbb3b4495564c4)
confirmed at **14:54:18 Europe/Moscow**. Five owned inputs totaling **12,737,763 sats**
(including the HL receipt and the additional cold address's **99,584 sats**) became
one main-address output of **12,736,999 sats**, paying **764 sats** in network fees.
This is an internal transfer, not a trade. No new purchases or sales appeared in
refreshed HL evidence. The acquisition list therefore remains **30 purchases and
one sale**. Capitalizing the consolidation fee retains the basis and raises the
physical average from **71,513.59** to **71,517.88**, and the selected hedge-adjusted
average from **75,278.13** to **75,282.64**. Expensing it leaves both averages unchanged.

## Provenance and accounting

All acquisitions in the tracked BTC/UBTC pool are traced: four routed purchases and
26 HL spot buys. Original spend is **5,608.30 USDT + 3,511.484020 USDC**. The small
HL sale was **0.00017 BTC**, net **10.49253009 USDC**, on **8 June at 00:08:18 Moscow**
(7 June UTC). Proportional basis is removed at the sale-time moving average.

| Routed purchase | Net BTC delivered | Original spend |
|---|---:|---:|
| Garden via LI.FI, 15 May | 0.01862054 | 1,500 USDT |
| Symbiosis, 2 June | 0.01475883 | 1,000 USDT |
| Symbiosis, 5 June | 0.03427525 | 2,099.70 USDT |
| Across, 13 November | 0.01460838 | 1,008.60 USDT |

`artifacts/purchases.json`, `artifacts/swap-evidence.json` and `artifacts/external-acquisitions.json` retain exact
source/destination hashes and original token debits. The June routes' intermediate
997.060123 USDC and syBTC amounts are not separate purchases. Garden's gross funding
was 1,862,743 sats, but redemption delivered 1,862,054; that difference is already
included in net acquired BTC. Its indexed May 19 timestamps conflict with the actual
May 15 BTC confirmation; transaction hashes/chain events take precedence.

The August 0.001 BTC deposit credited **0.0009755714 UBTC**, a **0.0000244286 BTC**
bridge loss. Transfers between the two HL masters (0.00231 UBTC out, 0.0068773533
UBTC back) preserve basis and are deduplicated by public transfer hash. All four
HL-to-BTC withdrawals are paired in `artifacts/reconciliation.json`. Pairings are corroborated
by full-precision public sends, native receipts and the user's earlier CSV; independent
bridge operation IDs were not retrieved. Rounded CSV amounts/settlement times do not
replace actual dispatch quantities and confirmed BTC outputs.

The October acceleration path was user-confirmed internal: 100,000 sats moved to
hot storage; 99,694 sats of later change became 99,584 sats at the additional cold
address after a 110-sat fee. Those funds are now consolidated. They were never an
inferred acceleration service charge or a sale. `artifacts/bitcoin-history.json` retains the
full parent/child path; `artifacts/purchases.json` records the classification.

```text
  0.0676546200 BTC   three original routed purchases, net
+ 0.0146083800 BTC   Across purchase, net
+ 0.0453800000 BTC   26 HL buys, gross
- 0.0000235414 BTC   HL buy fees in UBTC
- 0.0001700000 BTC   one HL sale
- 0.0000244286 BTC   BTC → UBTC bridge loss
- 0.0000229800 BTC   four UBTC → BTC delivery losses
- 0.0000320600 BTC   wallet network fees: 3,206 sats
= 0.1273699900 BTC   confirmed native BTC; zero remaining UBTC
```

One moving weighted-average pool covers BTC and UBTC across all confirmed accounts.
Internal transfers retain basis. Expensed BTC transfer fees remove proportional basis;
capitalized BTC transfer fees reduce quantity but retain basis, with the identified
1 USDC transfer charge added. Trading fees are already included through net purchases.
The synthetic hedge scenario removes exposure/basis at short entry and repurchases at
closing price plus closing fee. Funding is separate realized cash. See the hedge report
for the optional funding-carried model and the independent PnL identity check.

## Precision limits and excluded evidence

- Historical USDC/USDT execution rates are unavailable; exact USDT fields stay null.
- Ethereum approval/execution and Polygon/HyperEVM gas remain unvalued. Shared bridge
  funding costs are unallocated, so capitalized fees are a known-fees estimate.
- The earlier failed 2,100 USDT route returned 2,099.70. Its 0.30 difference is excluded
  pending attribution; do not count both debits as purchases.
- Sanitized OKX export audit found identical 988 BTC spot cash-bill entries in spot-only
  and combined exports (536 buys, 452 sells), outside this wallet's provenance. January
  withdrawal did not match tracked receipts; February withdrawal was canceled. These
  unrelated trades, Earn and canceled transfers are excluded. Raw private exports and
  account/order/bill identifiers are not stored.

## Files

Readable results stay in this directory: `README.md`, `trades-summary.md` and
`hedge-analysis.md`. Machine-readable evidence and generated calculations live in
[`artifacts/`](artifacts/).

### Artifacts

| File | Purpose |
|---|---|
| `artifacts/wallet-ownership.json` | User-confirmed addresses, roles and HL masters; Bitcoin fetch scope |
| `artifacts/bitcoin-history.json` | Normalized confirmed transactions and reconciled address balances |
| `artifacts/purchases.json` | Curated receipt provenance and transfer classifications |
| `artifacts/swap-evidence.json` | Original USDT debits and Garden/Symbiosis routes |
| `artifacts/external-acquisitions.json` | Across source debit, fill and HyperCore credit |
| `artifacts/hyperliquid-evidence.json` | Normalized BTC fills, deduplicated transfers, closing balances |
| `artifacts/private-export-audit.json` | Sanitized historical export cross-checks |
| `artifacts/hedge-evidence.json` | Individual hedge fills/funding and contract-size validation |
| `artifacts/acquisitions.csv` | Generated machine-readable purchase ledger |
| `artifacts/reconciliation.json` | Generated physical policies, event ledger and bridge pairings |
| `artifacts/hedge-reconciliation.json` | Generated hedge summaries and identity checks |

The redundant `artifacts/change-branch.json` was removed: its useful ownership classification
is in `artifacts/purchases.json`, and its chain transactions/balances are in `artifacts/bitcoin-history.json`.
Repeated hedge replay timelines were removed from stored output; the full replay remains
available through `calculate()` in `scripts/reconcile-btc-hedge.py`, using preserved inputs.
Commands, online tools and when to request private evidence are in [research instructions](../README.md).
