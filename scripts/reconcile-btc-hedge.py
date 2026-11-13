#!/usr/bin/env python3
"""Reconstruct selected OKX hedges and model synthetic BTC sales/repurchases."""
import argparse
import csv
import hashlib
import io
import json
import runpy
import zipfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal as D
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research/btc-cost-basis"
BASE = runpy.run_path(str(Path(__file__).with_name("reconcile-btc.py")))
Pool = BASE["Pool"]
LOCAL = timezone(timedelta(hours=3))
CT_VALUE = D("0.01")
EPISODES = [
    ("july_august_hedge", "2026-07-29 18:06:43", "2026-08-10 18:10:00"),
    ("august_loss_hedge", "2026-08-16 21:37:33", "2026-08-23 09:38:00"),
]


def read(name):
    return json.loads((DATA / name).read_text())


def save(name, obj):
    path = DATA / name
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2) + "\n")
    tmp.replace(path)


def local_timestamp(value):
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=LOCAL)


def import_private(directory):
    rows, hashes = [], []
    for path in directory.glob("*_OKX Trading History_*.zip"):
        with zipfile.ZipFile(path) as archive:
            members = [n for n in archive.namelist() if "_UnifiedBillHistory/" in n and n.endswith(".csv")]
            if not members:
                continue
            hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
            for member in members:
                raw = list(csv.reader(io.StringIO(archive.read(member).decode("utf-8-sig"))))
                assert "Time Zone:UTC+3" in ",".join(raw[0])
                keys = [v.lstrip("\ufeff") for v in raw[1]]
                for row in raw[2:]:
                    item = dict(zip(keys, [v.lstrip("\ufeff") for v in row]))
                    if item["Trade Type"] == "Swap" and item["Symbol"] == "BTC-USDT-SWAP":
                        rows.append(item)
    assert len(hashes) == 1, "Expected one combined trading export"
    assert len({r["id"] for r in rows}) == len(rows), "Duplicate bill rows"
    rows.sort(key=lambda r: (r["Time"], int(r["id"])))
    episodes = []
    for episode_id, start, end in EPISODES:
        selected = [r for r in rows if start <= r["Time"] <= end]
        events = []
        position = entry_value = closing_value = opening_qty = closing_qty = D(0)
        reported_pnl = fees = funding = cash = D(0)
        for sequence, r in enumerate(selected):
            assert r["Balance Unit"] == "USDT" and r["Fee Unit"] == "USDT"
            assert r["Action"] in ("Buy", "Sell", "Funding fee income", "Funding fee expense"), "Review margin/settlement events"
            at = local_timestamp(r["Time"])
            event = dict(id=f"{episode_id}:{sequence:03d}", episode=episode_id,
                time_ms=int(at.timestamp() * 1000), occurred_at=at.astimezone(timezone.utc).isoformat(),
                action=r["Action"], contracts=r["Amount"], price_usdt=r["Filled Price"],
                reported_pnl_usdt=r["PnL"], fee_paid_usdt=str(-D(r["Fee"])),
                cash_change_usdt=r["Balance Change"])
            cash += D(r["Balance Change"])
            if r["Action"] in ("Buy", "Sell"):
                assert r["Trading Unit"] == "cont"
                qty = D(r["Amount"]) * CT_VALUE
                notional = qty * D(r["Filled Price"])
                event.update(btc_equivalent=str(qty), notional_usdt=str(notional))
                fees -= D(r["Fee"])
                reported_pnl += D(r["PnL"])
                if r["Action"] == "Sell":
                    assert D(r["PnL"]) == 0, "Selected short entry realizes other inventory"
                    position += qty
                    opening_qty += qty
                    entry_value += notional
                else:
                    assert qty <= position, "Closing more than selected short position"
                    position -= qty
                    closing_qty += qty
                    closing_value += notional
            else:
                # Use booked cash for funding; PnL-column rounding differs by tiny fractions of a cent.
                funding += D(r["Balance Change"])
            event["short_position_after_btc"] = str(position)
            events.append(event)
        assert position == 0 and opening_qty == closing_qty > 0, "Episode not flat-to-flat"
        assert entry_value - closing_value == reported_pnl, "Contract conversion disagrees with reported PnL"
        assert abs(cash - (reported_pnl - fees + funding)) <= D("0.00000001")
        episodes.append(dict(id=episode_id, opening_at=events[0]["occurred_at"], closing_at=events[-1]["occurred_at"],
            peak_short_btc=str(opening_qty), synthetic_sale_notional_usdt=str(entry_value),
            synthetic_repurchase_notional_usdt=str(closing_value),
            weighted_entry_price_usdt=str(entry_value/opening_qty),
            weighted_exit_price_usdt=str(closing_value/closing_qty),
            reported_price_pnl_usdt=str(reported_pnl), trading_fees_usdt=str(fees),
            net_funding_cash_usdt=str(funding), net_hedge_cash_pnl_usdt=str(cash), events=events))
    save("hedge-evidence.json", dict(instrument="BTC-USDT-SWAP", contract_value_btc=str(CT_VALUE),
        contract_reference="https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP",
        validation="Contract size independently validated against exact exported closing PnL for both episodes",
        source="User-supplied combined OKX trading export; UTC+03:00", archive_sha256=hashes[0],
        selection="Two complete flat-to-flat short episodes covering the Aug 5 entry and Aug 23 large loss; unrelated trades excluded",
        episodes=episodes))


def replay(physical_events, hedge_events, capitalize, carry_funding=False):
    pool = Pool(capitalize)
    expenses = {"USDT": D(0), "USDC": D(0)}
    funding = short = price_pnl = swap_fees = D(0)
    pending_funding = {}
    timeline = [(e["time_ms"], e["id"], False, e) for e in physical_events]
    timeline += [(e["time_ms"], e["id"], True, e) for e in hedge_events]
    timeline.sort(key=lambda x: (x[0], x[1]))
    traces = []
    for _, _, hedge, e in timeline:
        if hedge:
            fee = D(e["fee_paid_usdt"])
            if e["action"] == "Sell":
                qty = D(e["btc_equivalent"])
                removed = pool.remove(qty)
                for key, value in removed.items():
                    pool.realized[key] -= value
                pool.realized["USDT"] += D(e["notional_usdt"]) - fee
                short += qty
                price_pnl += D(e["notional_usdt"])
                swap_fees += fee
            elif e["action"] == "Buy":
                qty = D(e["btc_equivalent"])
                pool.add(qty, D(e["notional_usdt"]) + fee, "USDT")
                short -= qty
                price_pnl -= D(e["notional_usdt"])
                swap_fees += fee
                if carry_funding and short == 0:
                    # Credit the episode's funding to its closing repurchase,
                    # rather than changing the unhedged inventory mid-episode.
                    pool.cost["USDT"] -= pending_funding.pop(e["episode"], D(0))
            else:
                amount = D(e["cash_change_usdt"])
                funding += amount
                if carry_funding:
                    pending_funding[e["episode"]] = pending_funding.get(e["episode"], D(0)) + amount
                else:
                    pool.realized["USDT"] += amount
        else:
            kind = e["kind"]
            if kind == "acquire":
                pool.add(D(e["quantity_btc"]), D(e["quote_amount"]), e["quote_currency"])
            elif kind == "buy":
                pool.add(D(e["gross_btc"])-D(e["fee"]), D(e["quote_amount"]), "USDC")
            elif kind == "sell":
                removed = pool.remove(D(e["gross_btc"]))
                for key, value in removed.items():
                    pool.realized[key] -= value
                pool.realized["USDC"] += D(e["quote_amount"])-D(e["fee"])
            elif kind == "fee_quote":
                if capitalize:
                    pool.cost[e["currency"]] += D(e["amount"])
                else:
                    expenses[e["currency"]] += D(e["amount"])
            else:
                assert kind == "fee_btc"
                removed = pool.remove(D(e["quantity_btc"]), fee=True)
                if not capitalize:
                    for key, value in removed.items():
                        expenses[key] += value
        assert pool.quantity > 0 and short >= 0
        traces.append(dict(time_ms=e["time_ms"], id=e["id"], hedge=hedge,
            net_btc_exposure=str(pool.quantity), short_btc=str(short),
            physical_btc=str(pool.quantity+short), basis_native={k:str(v) for k,v in pool.cost.items()},
            estimated_average_usdt_at_usdc_parity=str(sum(pool.cost.values())/pool.quantity)))
    assert short == 0 and not pending_funding
    return dict(remaining_btc=str(pool.quantity), remaining_basis_native={k:str(v) for k,v in pool.cost.items()},
        estimated_basis_usdt_at_usdc_parity=str(sum(pool.cost.values())),
        estimated_average_usdt_per_btc_at_usdc_parity=str(sum(pool.cost.values())/pool.quantity),
        synthetic_realized_native={k:str(v) for k,v in pool.realized.items()},
        expensed_native={k:str(v) for k,v in expenses.items()}, funding_cash_usdt=str(funding),
        hedge_execution_price_pnl_usdt=str(price_pnl), hedge_trading_fees_usdt=str(swap_fees), timeline=traces)


def calculate():
    base = read("reconciliation.json")
    evidence = read("hedge-evidence.json")
    scenarios = {}
    for name, selection in [("loss_hedge_only", ["august_loss_hedge"]),
                            ("both_hedges", [x[0] for x in EPISODES])]:
        episodes = [ep for ep in evidence["episodes"] if ep["id"] in selection]
        hedge_events = [e for ep in episodes for e in ep["events"]]
        cash_pnl = sum(D(ep["net_hedge_cash_pnl_usdt"]) for ep in episodes)
        policies = {}
        for policy, baseline in base["policies"].items():
            capitalize = policy == "capitalize_identified_transfer_fees"
            events = [x["event"] for x in baseline["events"]]
            plain = replay(events, [], capitalize)
            assert plain["remaining_basis_native"] == baseline["remaining_basis_native"], "Physical replay changed"
            result = replay(events, hedge_events, capitalize)
            carried = replay(events, hedge_events, capitalize, carry_funding=True)
            assert result["remaining_btc"] == baseline["remaining_btc"]
            # Independent economic identity: synthetic realized PnL minus remaining
            # basis and expensed costs must equal physical accounting plus swap cash PnL.
            def total_without_mark(r):
                return sum(map(D,r["synthetic_realized_native"].values())) - sum(map(D,r["remaining_basis_native"].values())) - sum(map(D,r["expensed_native"].values()))
            identity_residual = total_without_mark(result)-total_without_mark(plain)-cash_pnl
            assert abs(identity_residual) < D("0.00000002"), "Synthetic model double-counts or misses hedge PnL"
            assert abs(total_without_mark(carried)-total_without_mark(plain)-cash_pnl) < D("0.00000002")
            result["pnl_identity_residual_usdt_at_parity"] = str(identity_residual)
            result["averages_immediately_after_episode_close_at_parity"] = {
                ep["id"]: next(t["estimated_average_usdt_at_usdc_parity"] for t in result["timeline"]
                               if t["id"] == ep["events"][-1]["id"]) for ep in episodes}
            result["average_with_funding_carried_into_basis_at_parity"] = carried["estimated_average_usdt_per_btc_at_usdc_parity"]
            result["physical_baseline_average_at_parity"] = baseline["estimated_average_usdt_per_btc_at_usdc_parity"]
            policies[policy] = result
        scenarios[name] = dict(episodes=selection, actual_net_hedge_cash_pnl_usdt=str(cash_pnl), policies=policies)
    return dict(schema_version=1, view="Synthetic sell at short entry; repurchase at short close",
        actual_physical_btc_unchanged=True, estimated_currency_assumption="1 USDC = 1 USDT",
        funding_policy="Funding recognized separately; optional funding-carried scenario credits each episode's funding at closing repurchase",
        fee_policy="Opening swap fees reduce synthetic sale proceeds; closing fees increase synthetic repurchase cost",
        excluded="Unrelated OKX swaps/margin trades, collateral transfers and manual margin changes",
        warning="Do not add exported swap price PnL to basis again: entry/exit fills already represent it",
        scenarios=scenarios)


def markdown(result):
    evidence = read("hedge-evidence.json")
    lines = ["# BTC hedge chronology and synthetic re-entry cost", "",
        "Times: **Europe/Moscow**. Separate economic-exposure scenario; physical BTC purchase records remain unchanged.", "",
        "The export shows **two separate hedges**, rather than one position held continuously from 5 August.", "",
        "| Hedge | BTC short | Weighted entry | Exit price | Price PnL | Trading fees | Net funding | Net cash PnL |",
        "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for ep in evidence["episodes"]:
        label = "29 July–10 August" if ep["id"] == EPISODES[0][0] else "16–23 August"
        vals = [ep[k] for k in ["peak_short_btc", "weighted_entry_price_usdt", "weighted_exit_price_usdt", "reported_price_pnl_usdt", "trading_fees_usdt", "net_funding_cash_usdt", "net_hedge_cash_pnl_usdt"]]
        lines.append("| "+label+" | "+vals[0]+" | "+" | ".join(f"{D(v):,.6f}" for v in vals[1:])+" |")
    lines += ["", "Prices and cash amounts are **USDT**. Positive funding is income. The remembered roughly $700 loss corresponds to the second hedge: **629.56 USDT net loss**, closed at **76,262.10**.", "",
        "## Execution chronology", "", "Same-time fills at the same price are grouped below; every individual fill and funding payment is retained in `hedge-evidence.json`.", "",
        "| Local time | Synthetic action | BTC | Fill price, USDT/BTC | Fee, USDT | Short after fill, BTC |",
        "|---|---|---:|---:|---:|---:|"]
    groups = []
    for ep in evidence["episodes"]:
        for e in ep["events"]:
            if e["action"] not in ("Buy", "Sell"):
                continue
            key = (e["time_ms"],e["action"],e["price_usdt"])
            if groups and groups[-1]["key"] == key:
                groups[-1]["qty"] += D(e["btc_equivalent"])
                groups[-1]["fee"] += D(e["fee_paid_usdt"])
                groups[-1]["position"] = e["short_position_after_btc"]
            else:
                groups.append(dict(key=key, qty=D(e["btc_equivalent"]), fee=D(e["fee_paid_usdt"]), position=e["short_position_after_btc"]))
    for g in groups:
        at,action,price=g["key"]
        date = datetime.fromtimestamp(at/1000,ZoneInfo("Europe/Moscow")).strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"| {date} | {'Sell / open short' if action=='Sell' else 'Buy / close short'} | {g['qty']} | {D(price):,.2f} | {g['fee']:.8f} | {g['position']} |")
    lines += ["", "The largest selected hedge was **0.0589 BTC**, with **3,861.89 USDT** opening notional and **4,491.84 USDT** closing notional. It was a partial hedge, not a sale of all physical BTC.", "",
        "## Recalculated average", "", "Current full-wallet quantity remains **" + result["scenarios"]["both_hedges"]["policies"]["expense_transfer_fees"]["remaining_btc"].rstrip("0").rstrip(".") + " BTC**. Figures below assume **1 USDC = 1 USDT** and exclude unvalued gas.", "",
        "| Scenario | Average / BTC, transfer fees expensed | Average / BTC, identified transfer fees capitalized |",
        "|---|---:|---:|"]
    first = result["scenarios"]["loss_hedge_only"]["policies"]
    keys = ["expense_transfer_fees", "capitalize_identified_transfer_fees"]
    lines.append("| Physical purchases only | "+" | ".join(f"{D(first[k]['physical_baseline_average_at_parity']):,.2f}" for k in keys)+" |")
    for name,label in [("loss_hedge_only","16–23 August hedge as sell/rebuy"),("both_hedges","Both July–August hedges as sell/rebuy")]:
        ps=result["scenarios"][name]["policies"]
        lines.append("| "+label+" | "+" | ".join(f"{D(ps[k]['estimated_average_usdt_per_btc_at_usdc_parity']):,.2f}" for k in keys)+" |")
    lines += ["", "Immediately after the **23 August close**, the blended exposure average was:", "",
        "| Scenario | Transfer fees expensed | Identified transfer fees capitalized |", "|---|---:|---:|"]
    for name,label in [("loss_hedge_only","16–23 August hedge only"),("both_hedges","Including the earlier hedge")]:
        ps=result["scenarios"][name]["policies"]
        lines.append("| "+label+" | "+" | ".join(f"{D(ps[k]['averages_immediately_after_episode_close_at_parity']['august_loss_hedge']):,.2f}" for k in keys)+" |")
    lines += ["", "The close itself synthetically repurchased **0.0589 BTC at 76,262.10**, or **76,300.23 USDT/BTC including its closing trading fee**. The blended average also includes the unhedged remainder. Later physical purchases bring it to the current averages above.", "",
        "Opening short fills remove BTC quantity and proportional basis from the synthetic exposure pool; their proceeds realize a synthetic gain/loss. Closing fills add that quantity back at the actual repurchase price plus closing trading fees. Internal physical transfers still preserve ownership; BTC transfer losses reduce exposure.", "",
        "Funding is separate realized cash income/expense in the main table. If instead credited to each episode's closing repurchase, the current averages become:", "",
        "| Scenario | Transfer fees expensed | Identified transfer fees capitalized |", "|---|---:|---:|"]
    for name,label in [("loss_hedge_only","16–23 August hedge"),("both_hedges","Both hedges")]:
        ps=result["scenarios"][name]["policies"]
        lines.append("| "+label+" | "+" | ".join(f"{D(ps[k]['average_with_funding_carried_into_basis_at_parity']):,.2f}" for k in keys)+" |")
    lines += ["", "The higher synthetic remaining basis is **not simply the hedge loss added to the physical basis**: opening the hedge also realizes the synthetic sale's difference from the old acquisition basis. Do not add the exported swap loss again after replaying the sale/rebuy fills.", "",
        "`hedge-reconciliation.json` records both scenario traces, the basis after every event and an independent PnL identity check. Physical plus derivative PnL equals synthetic realized plus unrealized PnL after accounting for fees; the loss is counted once.", "",
        "Contract conversion: **1 contract = 0.01 BTC**, per the [OKX instrument specification](https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP), independently validated by matching both exported closing PnLs exactly. Collateral/margin movements are not trade quantities or additional losses.", "",
        "## Repeat", "", "```sh", "python3 scripts/reconcile-btc-hedge.py import-private", "python3 scripts/reconcile-btc-hedge.py calculate", "python3 scripts/reconcile-btc-hedge.py verify", "```", "",
        "Offline verification uses sanitized evidence. Import reads only the combined ZIP in memory and discards account, order and bill identifiers. It never reads `.env`. [Physical report](README.md) · [Physical trades](trades-summary.md)", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=["import-private","calculate","verify"])
    parser.add_argument("--directory",type=Path,default=ROOT)
    args=parser.parse_args()
    if args.command=="import-private":
        import_private(args.directory)
    else:
        result=calculate()
        if args.command=="calculate":
            save("hedge-reconciliation.json",result)
            (DATA/"hedge-analysis.md").write_text(markdown(result))
        else:
            assert result==read("hedge-reconciliation.json"),"Stored hedge calculation differs"
            assert markdown(result)==(DATA/"hedge-analysis.md").read_text(),"Markdown differs from calculation"
        print(json.dumps({name:{p:{k:v for k,v in r.items() if k not in ("timeline","synthetic_realized_native","expensed_native")}
                                 for p,r in s["policies"].items()} for name,s in result["scenarios"].items()},indent=2))
