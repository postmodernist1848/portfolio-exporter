# BTC hedge chronology and synthetic re-entry cost

Times: **Europe/Moscow**. Separate economic-exposure scenario; physical BTC purchase records remain unchanged.

The export shows **two separate hedges**, rather than one position held continuously from 5 August.

| Hedge | BTC short | Weighted entry | Exit price | Price PnL | Trading fees | Net funding | Net cash PnL |
|---|---:|---:|---:|---:|---:|---:|---:|
| 29 July–10 August | 0.0363 | 64,643.939669 | 64,641.700000 | 0.081300 | 2.059884 | 2.084627 | 0.106043 |
| 16–23 August | 0.0589 | 65,566.972666 | 76,262.100000 | -629.943000 | 4.176866 | 4.558697 | -629.561169 |

Prices and cash amounts are **USDT**. Positive funding is income. The remembered roughly $700 loss corresponds to the second hedge: **629.56 USDT net loss**, closed at **76,262.10**.

## Execution chronology

Same-time fills at the same price are grouped below; every individual fill and funding payment is retained in `artifacts/hedge-evidence.json`.

| Local time | Synthetic action | BTC | Fill price, USDT/BTC | Fee, USDT | Short after fill, BTC |
|---|---|---:|---:|---:|---:|
| 2026-07-29 18:06:43 | Sell / open short | 0.0049 | 64,085.00 | 0.15700825 | 0.0049 |
| 2026-07-29 21:07:31 | Sell / open short | 0.0047 | 64,409.30 | 0.15136186 | 0.0096 |
| 2026-08-05 18:20:31 | Sell / open short | 0.012 | 64,527.90 | 0.38716740 | 0.0216 |
| 2026-08-05 23:20:59 | Sell / open short | 0.0147 | 65,000.00 | 0.19110000 | 0.0363 |
| 2026-08-10 18:10:00 | Buy / close short | 0.0363 | 64,641.70 | 1.17324686 | 0.0000 |
| 2026-08-16 21:37:33 | Sell / open short | 0.0160 | 63,120.60 | 0.50496480 | 0.0160 |
| 2026-08-17 18:36:03 | Sell / open short | 0.0156 | 64,009.90 | 0.49927724 | 0.0316 |
| 2026-08-19 18:30:52 | Sell / open short | 0.0273 | 67,890.50 | 0.92670533 | 0.0589 |
| 2026-08-23 09:38:00 | Buy / close short | 0.0589 | 76,262.10 | 2.24591885 | 0.0000 |

The largest selected hedge was **0.0589 BTC**, with **3,861.89 USDT** opening notional and **4,491.84 USDT** closing notional. It was a partial hedge, not a sale of all physical BTC.

## Recalculated average

Current full-wallet quantity remains **0.12736999 BTC**. Figures below assume **1 USDC = 1 USDT** and exclude unvalued gas.

| Scenario | Average / BTC, transfer fees expensed | Average / BTC, identified transfer fees capitalized |
|---|---:|---:|
| Physical purchases only | 71,467.00 | 71,517.88 |
| 16–23 August hedge as sell/rebuy | 75,372.87 | 75,412.98 |
| Both July–August hedges as sell/rebuy | 75,243.72 | 75,282.64 |

Immediately after the **23 August close**, the blended exposure average was:

| Scenario | Transfer fees expensed | Identified transfer fees capitalized |
|---|---:|---:|
| 16–23 August hedge only | 75,093.91 | 75,129.61 |
| Including the earlier hedge | 74,854.42 | 74,888.01 |

The close itself synthetically repurchased **0.0589 BTC at 76,262.10**, or **76,300.23 USDT/BTC including its closing trading fee**. The blended average also includes the unhedged remainder. Later physical purchases bring it to the current averages above.

Opening short fills remove BTC quantity and proportional basis from the synthetic exposure pool; their proceeds realize a synthetic gain/loss. Closing fills add that quantity back at the actual repurchase price plus closing trading fees. Internal physical transfers still preserve ownership; BTC transfer losses reduce exposure.

Funding is separate realized cash income/expense in the main table. If instead credited to each episode's closing repurchase, the current averages become:

| Scenario | Transfer fees expensed | Identified transfer fees capitalized |
|---|---:|---:|
| 16–23 August hedge | 75,337.09 | 75,377.19 |
| Both hedges | 75,205.61 | 75,244.51 |

The higher synthetic remaining basis is **not simply the hedge loss added to the physical basis**: opening the hedge also realizes the synthetic sale's difference from the old acquisition basis. Do not add the exported swap loss again after replaying the sale/rebuy fills.

`artifacts/hedge-reconciliation.json` records scenario summaries and an independent PnL identity check. Full replay timelines can be regenerated with `calculate()` from the preserved event evidence. Physical plus derivative PnL equals synthetic realized plus unrealized PnL after accounting for fees; the loss is counted once.

Contract conversion: **1 contract = 0.01 BTC**, per the [OKX instrument specification](https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP), independently validated by matching both exported closing PnLs exactly. Collateral/margin movements are not trade quantities or additional losses.

## Repeat

Use preserved evidence for unchanged hedges. Import private exports only when new evidence is required; see [research workflow](../README.md).

```sh
python3 scripts/reconcile-btc-hedge.py calculate
python3 scripts/reconcile-btc-hedge.py verify
```

Offline verification uses sanitized evidence. Import reads only the combined ZIP in memory and discards account, order and bill identifiers. It never reads `.env`. [Physical report](README.md) · [Physical trades](trades-summary.md)
