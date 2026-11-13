# Bitcoin purchase-cost report

As of 13 November 2026. This investigation is separate from the application;
no dashboard, production database, provider lifecycle or RUB accounting changed.
No `.env` file was read and no API keys were used.

Additional calculation: [OKX hedge chronology and synthetic sell/rebuy average](hedge-analysis.md).
That scenario treats short opening/closing fills as changes in BTC exposure;
the physical acquisition accounting below remains separate.

## Result

All acquisitions contributing to the tracked BTC/UBTC pool are traced:
**four DEX purchases, 26 Hyperliquid spot buys, one small Hyperliquid spot sale**.
The four user-confirmed Bitcoin addresses hold **0.12737763 BTC** in total.
Both Hyperliquid accounts finish with zero UBTC. Internal transfers are not
counted as purchases or sales.

| Metric | Estimate in USDT |
|---|---:|
| Moving weighted-average purchase cost per BTC, transfer fees expensed | **71,467.00** |
| Remaining cost basis under that policy | **9,103.30** |
| Average with identified transfer fees capitalized | **71,513.59** |
| Remaining basis with those fees capitalized | **9,109.23** |

These are **approximate USDT equivalents using 1 USDC = 1 USDT**, not exact
historical USDT execution costs. The ledger retains USDT and USDC separately.
Historical conversion rates and Ethereum transaction/approval gas are incomplete,
so the second figure is a **known-fees estimate**, not a fully all-in cost.
The exact-USDT field remains null, while acquisition provenance is complete.

The earlier 0.10055335 BTC balance covered only the two original addresses.
The additional 99,584 sats belong to the user's cold wallet, as subsequently
confirmed, and are independently verified unspent. Including them changes the
scope and replaces the earlier narrower-scope average estimates.


## 13 November update

[Confirmed receipt](https://blockstream.info/tx/538993415c7d47a32d56957e6cb273a5ef5fad45687bc9cfc25543597a7b3eff):
**0.02582844 BTC**, confirmed 23:46:21 Europe/Moscow. HyperCore debited
0.0258330811 UBTC; the bridge/delivery difference is 0.0000046411 BTC.
The withdrawal combines four new UBTC/USDC spot buys (799.139440 USDC spend,
0.01123 BTC gross, 0.0112247011 net after trading fees) with 0.01460838 UBTC
bought through Across from Polygon for **1,008.60 USDT**.

The [Across source transaction](https://polygonscan.com/tx/0xf6e12921f80390d47cd62b9a73f83cfe0cf333924af9b24357384be8f555d7b4)
is linked by the public Across deposit record to the
[HyperEVM fill](https://hyperevmscan.io/tx/0x371efc6a492db0e0302a8e66d91f9dc8863f8a5b9e6a85cf12eddad44a1f75a2).
Its UBTC transfer logs show 0.01460838 delivered to the first HL wallet, then
[transferred to HyperCore](https://hyperevmscan.io/tx/0x4a2caecb446875a208ebb5e9f7f6c3653d3169d1fc495799628994951228135b).
Polygon/HyperEVM gas is excluded. Relayer intermediary transfers are not added
to original user spend.

Using the previously selected **both-hedges synthetic sell/rebuy model with
identified transfer fees capitalized**, the average moves from **76,623.06**
to **75,278.13 USDT/BTC**, with **9,588.75 USDT** modeled remaining basis.
USDC/USDT parity and separate recognition of funding remain unchanged.

## Holdings and ownership

| Address | Role | Confirmed sats |
|---|---|---:|
| `bc1q45v5f5gq2rdrek3n9qkn8g85h6eq80r2m99jn7` | Original cold address | 12,638,179 |
| `bc1qn9an2rzjt752j83x0nxjjgf59mmy34td806daw` | Original hot address | 0 |
| `bc1qtg22qeel8htmdh5em3f0nu2rghygh8tfvzy2w3` | Derived hot/change address | 0 |
| `bc1qshzgardj4ewnq0nqzaqlmtmzevguxhpy9qcmyc` | Additional cold address | 99,584 |
| **Total** | | **12,737,763** |

Ownership comes from user confirmation, not an assumption based on transaction
clustering. `wallet-ownership.json` records that evidence. Public address-state
checks and the current full transaction history are in `bitcoin-history.json`.

## Acquisitions

`acquisitions.csv` is the complete 30-row purchase list. Each entry records time,
venue/account, gross and net BTC where applicable, BTC trading fee, quote currency,
quote spend, effective price, and transaction hash or public Hyperliquid trade ID.

| Source | BTC acquired | Actual quote spend |
|---|---:|---:|
| Garden via LI.FI, 15 May | 0.01862054 net delivered | 1,500 USDT |
| Symbiosis routed swap, 2 June | 0.01475883 net delivered | 1,000 USDT |
| Symbiosis routed swap, 5 June | 0.03427525 net delivered | 2,099.7 USDT |
| Across Polygon → HyperEVM, 13 November | 0.01460838 net delivered | 1,008.6 USDT |
| Hyperliquid, 26 spot buy fills | 0.04538 gross / 0.0453564586 after trading fees | 3,511.484020 USDC |

The three DEX receipts alone have a combined effective price of
67,987.96593640 USDT/BTC; that is not the whole-wallet average.

Source evidence:

* Garden order `ae40afd61e5bbe3f304d08c9555830eb3665f5eaa12cda820056ab72fe775c2a`:
  [order query](https://api.garden.finance/v2/orders?address=bc1q45v5f5gq2rdrek3n9qkn8g85h6eq80r2m99jn7&per_page=100),
  [Ethereum debit](https://etherscan.io/tx/0x968471c6e3594167470221b282c1201a6d32bf1ac194a872c765eb59e474e3b5),
  [BTC payout](https://blockstream.info/tx/f1501ab6d0ca97563dd57bbcbd271da48750d9bf28eea6d5a4a5fe1d86c53e4e).
  Gross destination funding was 1,862,743 sats; net receipt was 1,862,054 sats.
  The 689-sat redemption difference is already reflected in net acquired BTC.
* 2 June: [Ethereum debit](https://etherscan.io/tx/0x5f8e53f423bf21e2a6bf6e5913cc4c7bfe78e9592e408aa3dcbe2ab90a4b41a2)
  was **1,000 USDT**, not the intermediate 997.060123 USDC in the Symbiosis summary.
  Its destination hash matches the [BTC payout](https://blockstream.info/tx/5609a78fd2a59db927f923ab1ed9b41f13bf8642dbefbe4af32b62300b77012a).
* 5 June: [Ethereum debit](https://etherscan.io/tx/0xf2ac7fc5084f146549dd240be5d64c9da85988872db68a3d6699a8356123b403)
  was **2,099.7 USDT**, routed through USDC, WBTC and syBTC before the
  [native BTC payout](https://blockstream.info/tx/bba7df493b5168697a15a4caf2576e829dbbd28204ac4264faae650ecb494b69).
  syBTC was an intermediate route asset, not a separate prior purchase.
* Hyperliquid fills were fetched publicly for both supplied master addresses.
  `spotMeta` maps `@142` to UBTC/USDC; only those spot fills enter this report.
  The [official info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
  documents this mapping and distinguishes spot from perpetuals.
  Every fill's starting UBTC position independently agrees with previous fills
  and transfers. Neither master has a discovered subaccount, and both end at zero.

Garden's indexed initiate/redeem timestamps say 19 May although the actual BTC
transaction confirms on 15 May. Transaction hashes and actual chain events take
precedence. This discrepancy remains recorded rather than silently corrected.

One HL spot sale occurred on 7 June: **0.00017 BTC at 61,764 USDC/BTC**,
10.49988 USDC gross proceeds, 0.00734991 USDC trading fee and
**10.49253009 USDC net proceeds**. Its allocated basis is removed using the pool's
average at that time. The two CSV cash sides of a trade are not two purchases.

## Hyperliquid transfers and bridge losses

The three initially unassigned Bitcoin receipts are corroborated by public
HyperCore UBTC sends, the user's deposit/withdrawal CSV, and matching Bitcoin
receipts. Public bridge operation records were not retrieved; the pairing is
corroborated by timing, destination flow, quantities, fees and full inventory
reconciliation, rather than an independently fetched bridge operation ID.

| BTC receipt | Full-precision UBTC sent | Native BTC received | Difference, BTC |
|---|---:|---:|---:|
| 7 June | 0.0003396432 | 0.00033671 | 0.0000029332 |
| 4 October | 0.0100903612 | 0.01008061 | 0.0000097512 |
| 20 October | 0.0245073245 | 0.02450167 | 0.0000056545 |
| 13 November | 0.0258330811 | 0.02582844 | 0.0000046411 |

The 7 June send also charged 1 USDC. The difference between the full UBTC debit
and actual BTC received is treated as combined bridge/delivery loss; the CSV's
rounded displayed fee is not subtracted again.

The August test transfer sent **0.001 BTC** from the hot wallet to HL account
`0x36c56c5f4b084244b1b0137e1cbb76af200fee5b` and credited
**0.0009755714 UBTC**, a **0.0000244286 BTC** bridge loss. It carries existing
purchase basis and is not a new acquisition.

Between the two HL accounts, **0.00231 UBTC** moved to the second account on
7 September, then **0.0068773533 UBTC** moved back on 3 October. The latter
includes additional spot buys. Each transfer appears in both account histories;
it is deduplicated by transfer hash and preserves quantity and basis.

The user's CSV displays rounded amounts and, for withdrawals, later processing
times. It is corroborating evidence; accounting uses full-precision public
HyperCore sends and actual confirmed BTC outputs.

## October acceleration funds

The user confirmed that these funds moved between their wallets and later
returned to cold storage:

1. [4c3c705d…](https://blockstream.info/tx/4c3c705de38504fcdec05c0f2e5ea18836ddf30356461668a9b3bd553abefa51)
   sent 100,000 sats from the original cold address to the original hot address,
   with a 282-sat fee and 907,779 sats returned as change.
2. [7ffc8dec…](https://blockstream.info/tx/7ffc8dec9ba4fb2f271a970abd66079b141c6587e51534d320f1dc3d959738e3)
   sent 6,697,389 sats to the original cold address, **99,694 sats to a derived
   hot/change address**, and paid a 351-sat fee.
3. [7021d6bf…](https://blockstream.info/tx/7021d6bf2470c4edc7fbaf1f6359289b77b8a347d06a84a1172d77f2f97ef0be)
   spent those 99,694 sats on 20 October, returning **99,584 sats to the
   additional cold address** and paying a 110-sat fee. That output is unspent.

The 99,694 sats were not an acceleration service charge. There is no sale here.
These transaction fees are included in the wallet-fee total below. A separate
service charge cannot be inferred from these outputs and has not been invented.

## Exact quantity reconciliation

```text
  0.0676546200 BTC   three DEX purchases, net delivered
+ 0.0146083800 BTC   Across purchase, net delivered to HyperEVM
+ 0.0453800000 BTC   26 HL spot buys, gross
- 0.0000235414 BTC   HL buy fees charged in UBTC
- 0.0001700000 BTC   one HL spot sale
- 0.0000244286 BTC   August BTC -> UBTC bridge loss
- 0.0000229800 BTC   four UBTC -> BTC bridge/delivery losses
- 0.0000244200 BTC   wallet-paid Bitcoin network fees: 2,442 sats
= 0.1273776300 BTC   four Bitcoin addresses; both HL accounts zero UBTC
```

The original two addresses received 0.12840205 BTC in seven external-chain
receipts, but four are returns from HL. Summing receipt amounts as independent
purchases would double-count the August deposit and ignore HL's intermediate
buys, sale and fees. The original two-address external output of 99,694 sats is
internal once all four confirmed addresses are included.

## Accounting and remaining precision limits

The report uses one moving weighted-average pool across the tracked BTC and
UBTC accounts. Acquisitions add net acquired BTC and actual quote spend. A sale
removes proportional USDT and USDC basis at the sale-time average. Internal
transfers retain basis. Fees charged in BTC reduce quantity.

Two fee policies are calculated explicitly:

* **Expense transfer fees:** remove proportional basis with BTC lost to network
  and bridge fees. Quote-denominated transfer expenses are separate expenses.
  Purchase trading fees remain included through net acquired BTC.
* **Capitalize identified transfer fees:** retain basis when BTC is consumed as
  network/bridge fees and add the identified 1 USDC transfer charge. This raises
  the cost per remaining BTC. It is useful for approximate investment PnL.

Under the first policy the remaining native basis is approximately
**5,592.37238496 USDT + 3,510.92471882 USDC**. Adding them uses the explicit
parity approximation; exact USDT reporting requires acquisition-time USDC/USDT
rates. A single final current FX conversion is not equivalent to those rates.

Outstanding precision work:

* Value Ethereum execution and approval gas in USDT at the relevant times.
  Shared stablecoin funding/bridge expenses have not been allocated between BTC
  purchases and other assets.
* Decide whether the earlier 2,100 USDT attempted bridge followed by a
  2,099.7 USDT return contributes the 0.3 USDT difference to this BTC acquisition.
  The full two debits must never be counted as two purchases.
* Replace USDC/USDT parity with documented execution-time rates if exact USDT
  precision is desired. None of these gaps leaves an unknown BTC purchase source.

For PnL, use current BTC value in the same quote currency minus the chosen
remaining basis; keep realized sale PnL and expensed transfer costs separate.
Do not divide all historical purchase spend by today's balance and label the
result average purchase price.

## What the OKX exports established

The spot-only and combined-trading exports contain identical sets of **988 BTC
spot balance entries**: 536 buys and 452 sells. Those are cash-bill rows, not
necessarily separate orders. Each trade's USDT cash side is excluded from that
count. Futures and non-BTC trades are excluded.

The funding CSV records a January BTC withdrawal and a February withdrawal
followed by cancellation; it contains no transaction hashes or destinations.
Those records do not match the original six tracked BTC receipts. The three missing
receipts instead line up with HL withdrawals. Unrelated historical OKX buys,
Earn movements, and canceled withdrawals are therefore **not added to this
wallet's cost basis**. Private account IDs, order IDs and bill IDs are not kept
in the research artifacts. The audit records only relevant aggregate findings.

## Artifacts and repeatable workflow

* `wallet-ownership.json`: confirmed ownership and wallet roles.
* `bitcoin-history.json`: normalized confirmed transactions and address balances.
* `purchases.json`: seven receipt classifications and original DEX evidence.
* `external-acquisitions.json`: original Polygon USDT spend, Across route and HyperEVM-to-HyperCore credit.
* `acquisitions.csv`: complete purchase list; generated by the calculator.
* `hyperliquid-evidence.json`: BTC spot fills, deduplicated UBTC transfers,
  metadata mapping and closing balances.
* `swap-evidence.json`: normalized original USDT debits and DEX routing evidence.
* `private-export-audit.json`: sanitized export cross-checks and BTC transfer rows.
* `change-branch.json`: evidence for the internal October return path.
* `reconciliation.json`: complete calculation trace, bridge matches, exact native
  quote components, fee policies and approximate USDT results.

Offline checks, from the repository root:

```sh
python3 scripts/research-btc.py verify
python3 scripts/reconcile-btc.py verify
python3 -m unittest discover -s scripts -p 'test_reconcile_btc.py'
```

To update using public sources and new local exports:

```sh
python3 scripts/research-btc.py fetch
python3 scripts/fetch-btc-evidence.py --directory /tmp/btc-research
python3 scripts/reconcile-btc.py import-public --directory /tmp/btc-research
python3 scripts/reconcile-btc.py import-private --directory .
python3 scripts/reconcile-btc.py calculate
python3 scripts/reconcile-btc.py verify
```

Raw provider responses remain in the temporary cache. Only normalized relevant
public fields are imported. Private ZIPs are read in memory; account IDs and
raw rows are discarded. `.gitignore` excludes the supplied private input formats.
No script imports application configuration or reads environment files.

New purchases/withdrawals need review: add bridge hash pairings and any newly
confirmed wallet addresses explicitly. The verifier fails on unknown transfers,
missing fills, changed balances, unsupported fee currencies or history limits;
it does not silently invent zero-cost lots. Check that no subaccounts appeared.
Hyperliquid currently exposes only its most recent 10,000 fills, and individual
requests have limits: retain normalized evidence rather than assuming the API
will always reproduce arbitrarily old fills. One valid fill has an all-zero
hash; deduplicate fills by account and trade ID, not hash alone.

For new DEX receipts query Garden `/v2/orders?address=<address>` with `page` and
`per_page`, or Symbiosis `/explorer/v1/transactions?search=<EVM-address>`.
Symbiosis silently ignored tested `address`, `to_address` and `from_address`
filters and rejected BTC-address search; validate that returned records really
match the wallet. Inspect original source token transfers, not only bridge
summary amounts or USD valuations. Prefer exact transaction hashes over indexed
timestamps. Provider failures are not proof that no activity occurred.

Suggested update prompt:

> Update research/btc-cost-basis with the new purchases and wallet history. Do
> not read .env. Preserve manual evidence, wallet ownership and exact quantities.
> Run offline checks, refresh public data, review new bridge pairs and spot fills,
> and reconcile every account before reporting an average. Preserve native quote
> currencies and label any USDC/USDT approximation. Keep private export identifiers
> out of artifacts. Update the report and both fee-policy calculations.
