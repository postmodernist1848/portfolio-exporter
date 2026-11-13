#!/usr/bin/env python3
"""Offline BTC provenance and moving-average accounting. Never opens .env."""
import argparse
import csv
import hashlib
import io
import json
import zipfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 40
D = Decimal
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research/btc-cost-basis"
HL = ["0x36c56c5f4b084244b1b0137e1cbb76af200fee5b",
      "0x735b97415cd925daa56d2e2979eda5ddca056d55"]
WITHDRAWALS = [
    ("0x0868d1cd98e9602e09e2043d33a20a01e400e9b333ec7f00ac317d2057ed3a18",
     "b32441c19b115b22531cca0a3c84a5d5b30d3d7d2cb742bb6aef26542b6069f4"),
    ("0x0818015f207002cd09910445cd141c01eb001944bb73219fabe0acb1df73dcb7",
     "eaf4b33dcccd210dd37c1ed955965c8eaf1c6eb4f818f7f92ba80e8b00f9bb95"),
    ("0x71d29d45804684ba734c0446f88efa02041a002b1b49a38c159b48983f4a5ea5",
     "e157221b83aa7c516c9f5681d174c8462cb8b7d6600a3d5b1514bcc30c3e979b"),
    ("0x61d532019e8dfcf3634e0448b9e99802020800e739811bc5059ddd545d81d6de",
     "538993415c7d47a32d56957e6cb273a5ef5fad45687bc9cfc25543597a7b3eff"),
]


def read(name):
    return json.loads((DATA / name).read_text())


def save(name, obj):
    path = DATA / name
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2) + "\n")
    tmp.replace(path)


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat()


def milliseconds(instant):
    return int(datetime.fromisoformat(instant).timestamp() * 1000)


def import_public(cache):
    """Normalize only BTC-related public data; discard unrelated provider payloads."""
    def cached(name):
        return json.loads((cache / (name + ".json")).read_text())
    meta = cached("spot-meta")
    tokens = {x["index"]: x["name"] for x in meta["tokens"]}
    pair = next(x for x in meta["universe"] if x["name"] == "@142")
    assert [tokens[x] for x in pair["tokens"]] == ["UBTC", "USDC"]
    fills, transfers, accounts = [], {}, []
    for index, address in enumerate(HL, 1):
        raw_fills = cached(f"hl-{index}-userFillsByTime")
        raw_ledger = cached(f"hl-{index}-userNonFundingLedgerUpdates")
        assert len(raw_fills) < 2000 and len(raw_ledger) < 500, "Paginate before importing"
        assert cached(f"hl-{index}-subAccounts") in (None, []), "Include discovered subaccounts"
        accounts.append(dict(address=address, returned_fill_count=len(raw_fills),
            returned_ledger_count=len(raw_ledger), subaccounts=[],
            closing_ubtc=next((x["total"] for x in cached(f"hl-{index}-spotClearinghouseState")["balances"]
                              if x["coin"] == "UBTC"), "0")))
        for f in raw_fills:
            if f["coin"] != "@142":
                continue
            fills.append(dict(account=address, time_ms=f["time"], executed_at=iso(f["time"]),
                trade_id=str(f["tid"]), hash=f["hash"], market="UBTC/USDC",
                side="buy" if f["side"] == "B" else "sell", price_usdc=f["px"],
                gross_btc=f["sz"], fee=f["fee"], fee_token=f["feeToken"],
                start_position_btc=f["startPosition"]))
        for r in raw_ledger:
            delta = r["delta"]
            if delta.get("token") != "UBTC":
                continue
            normalized = dict(hash=r["hash"], time_ms=r["time"], occurred_at=iso(r["time"]),
                kind=delta["type"], from_address=delta["user"], to_address=delta["destination"],
                amount_btc=delta["amount"], fee=delta["fee"], fee_token=delta["feeToken"],
                native_token_fee=delta["nativeTokenFee"])
            if r["hash"] in transfers:
                assert transfers[r["hash"]] == normalized, "Account copies disagree"
            transfers[r["hash"]] = normalized
    save("hyperliquid-evidence.json", dict(
        fetched_at=datetime.now(timezone.utc).isoformat(),
        endpoint="https://api.hyperliquid.xyz/info", request_start_time_ms=0,
        pair=dict(coin="@142", base="UBTC", quote="USDC", base_token_index=197),
        accounts=accounts, fills=sorted(fills, key=lambda x: (x["time_ms"], x["trade_id"])),
        transfers=sorted(transfers.values(), key=lambda x: x["time_ms"])))
    raw = cached("acceleration-txs")
    child = next(x for x in raw if x["txid"].startswith("7021d6bf"))
    save("change-branch.json", dict(
        classification="internal_transfer_user_confirmed",
        parent_txid="7ffc8dec9ba4fb2f271a970abd66079b141c6587e51534d320f1dc3d959738e3",
        parent_vout=0, parent_address="bc1qtg22qeel8htmdh5em3f0nu2rghygh8tfvzy2w3",
        parent_sats=99694, child_txid=child["txid"], child_network_fee_sats=child["fee"],
        child_confirmed_at=iso(child["status"]["block_time"] * 1000),
        child_output_spent_at_check=cached("change-next-outspends")[0]["spent"],
        child_address_state=cached("change-next-state")["chain_stats"],
        child_outputs=[dict(address=x.get("scriptpubkey_address"), sats=x["value"]) for x in child["vout"]],
        notes=["Do not classify the 99694 sats as an acceleration fee.",
               "User confirmed this branch belongs to their hot/cold wallets; preserve its cost basis."]))


def import_private(directory):
    """Read exports in memory. Retain no UIDs, order IDs, bill IDs or raw rows."""
    families = {"funding": [], "spot": [], "all": []}
    for path in sorted(directory.glob("*_OKX *History_*.zip")):
        with zipfile.ZipFile(path) as archive:
            for member in archive.namelist():
                if not member.endswith(".csv"):
                    continue
                rows = list(csv.reader(io.StringIO(archive.read(member).decode("utf-8-sig"))))
                assert "Time Zone:UTC+3" in ",".join(rows[0]), "Unexpected export timezone"
                keys = [x.lstrip("\ufeff") for x in rows[1]]
                family = "funding" if "Funding History" in path.name else "spot" if "_Spot_" in member else "all"
                families[family].extend(dict(zip(keys, row)) for row in rows[2:])
    assert all(families.values()), "Expected funding, spot and combined trading archives"
    def btc_spot(rows):
        return [r for r in rows if r["Trade Type"] == "Spot" and r["Balance Unit"] == "BTC"]
    spot = btc_spot(families["spot"])
    combined = btc_spot(families["all"])
    assert {r["id"] for r in spot} == {r["id"] for r in combined}, "Spot/all exports disagree"
    assert len({r["id"] for r in spot}) == len(spot), "Duplicate BTC spot bills"
    btc_funding = [r for r in families["funding"] if r["Symbol"] == "BTC"]
    # This is a two-sided cash ledger, not one fill per CSV row. Count the BTC
    # balance side only; its USDT counter-entry must not become another purchase.
    audit = dict(
        source="User-supplied OKX funding, spot-only and combined-trading exports",
        export_timezone="UTC+03:00", spot_and_combined_btc_bill_sets_identical=True,
        btc_spot_balance_rows=len(spot), btc_spot_actions=dict(Counter(r["Action"] for r in spot)),
        funding_btc_types=dict(Counter(r["Type"] for r in btc_funding)),
        btc_withdrawal_bills=[dict(time_utc=datetime.strptime(r["Time"], "%Y-%m-%d %H:%M:%S")
            .replace(tzinfo=timezone(timedelta(hours=3))).astimezone(timezone.utc).isoformat(),
            kind=r["Type"], amount_btc=r["Amount"]) for r in btc_funding if "Withdrawal" in r["Type"]],
        interpretation=["Funding CSV is a cash-bill ledger; it contains no blockchain withdrawal hashes or destinations.",
            "February withdrawal was canceled. January withdrawal is outside the tracked two-address history.",
            "The three previously unassigned BTC receipts match Hyperliquid sends and the supplied HL CSV instead.",
            "Do not add unrelated OKX BTC buys or futures to this wallet's acquisition cost."])
    source = directory / "deposits_and_withdrawals.csv"
    rows = list(csv.DictReader(source.open()))
    audit["hl_csv_btc_rows"] = [dict(displayed_time=r["time"], action=r["action"],
        source=r["source"], destination=r["destination"], account_value_change=r["accountValueChange"],
        displayed_fee=r["fee"]) for r in rows if "BTC" in r["accountValueChange"]]
    audit["hl_csv_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    audit["hl_csv_notes"] = ["CSV display values are rounded and withdrawal times can be settlement times.",
        "Use public full-precision HyperCore transfers plus actual BTC outputs for accounting.",
        "For example June CSV withdrawal 0.00033714 is neither the full 0.0003396432 UBTC debit nor the actual 0.00033671 BTC output."]
    save("private-export-audit.json", audit)


class Pool:
    def __init__(self, capitalize_fees=False):
        self.quantity = D(0)
        self.cost = {"USDT": D(0), "USDC": D(0)}
        self.capitalize_fees = capitalize_fees
        self.realized = {"USDT": D(0), "USDC": D(0)}

    def add(self, qty, cost, currency):
        assert qty > 0 and cost >= 0 and currency in self.cost
        self.quantity += qty
        self.cost[currency] += cost

    def remove(self, qty, fee=False):
        assert D(0) <= qty <= self.quantity, "Negative or excessive BTC removal"
        removed = {key: value * qty / self.quantity for key, value in self.cost.items()}
        if not (fee and self.capitalize_fees):
            for key, value in removed.items():
                self.cost[key] -= value
        self.quantity -= qty
        return removed


def reconcile(write=False):
    h, ledger, hl = read("bitcoin-history.json"), read("purchases.json"), read("hyperliquid-evidence.json")
    txs = {t["txid"]: t for t in h["transactions"]}
    receipts = {r["btc_txid"]: r for r in ledger["receipts"]}
    transfers = {t["hash"]: t for t in hl["transfers"]}
    matches = {hl_hash: btc_hash for hl_hash, btc_hash in WITHDRAWALS}
    assert len({(f["account"], f["trade_id"]) for f in hl["fills"]}) == len(hl["fills"])
    events, routes = [], []
    extra = read("external-acquisitions.json")
    external_transfers = {x["hl_credit_hash"]: x for x in extra["acquisitions"]}
    accounts = {a: D(0) for a in HL}
    account_events = []
    for f in hl["fills"]:
        assert f["market"] == "UBTC/USDC"
        assert f["fee_token"] == ("UBTC" if f["side"] == "buy" else "USDC")
        events.append(dict(time_ms=f["time_ms"], kind=f["side"], id=f["hash"] + ":" + f["trade_id"],
            gross_btc=f["gross_btc"], fee=f["fee"], quote_currency="USDC",
            quote_amount=str(D(f["gross_btc"]) * D(f["price_usdc"]))))
        account_events.append((f["time_ms"], "fill", f))
    for t in hl["transfers"]:
        account_events.append((t["time_ms"], "transfer", t))
        if t["hash"] in matches:
            btc = txs[matches[t["hash"]]]
            received = D(btc["owned_output_sats"]) / 10**8
            assert btc["kind"] == "external_receipt" and received < D(t["amount_btc"])
            assert t["time_ms"] < milliseconds(btc["confirmed_at"]), "Dispatch must precede receipt"
            loss = D(t["amount_btc"]) - received
            routes.append(dict(hl_hash=t["hash"], btc_txid=btc["txid"],
                hl_debit_btc=t["amount_btc"], received_sats=btc["owned_output_sats"],
                bridge_loss_btc=str(loss), dispatch_at=t["occurred_at"], confirmed_at=btc["confirmed_at"],
                classification="internal_transfer_with_bridge_loss"))
            events.append(dict(time_ms=t["time_ms"], kind="fee_btc", id=t["hash"], quantity_btc=str(loss)))
            if D(t["fee"]):
                assert t["fee_token"] == "USDC"
                events.append(dict(time_ms=t["time_ms"], kind="fee_quote", id=t["hash"] + ":fee",
                                   amount=t["fee"], currency="USDC"))
        elif t["hash"] in external_transfers:
            acquisition = external_transfers[t["hash"]]
            assert t["to_address"] == acquisition["account"]
            assert D(t["amount_btc"]) == D(acquisition["net_btc"])
            events.append(dict(time_ms=milliseconds(acquisition["acquired_at"]), kind="acquire",
                id=acquisition["source_txid"], quantity_btc=acquisition["net_btc"],
                quote_currency=acquisition["quote_currency"], quote_amount=acquisition["quote_spent"]))
        elif t["from_address"] in HL and t["to_address"] in HL:
            pass  # Same user's accounts: preserve both quantity and cost.
        else:
            assert t["kind"] == "spotTransfer" and t["to_address"] == HL[0], "Unmatched UBTC transfer"
            source = txs["bb21dbefee6b3f84df3076eb50ccc6db6489b6bd94d078e9708e8d67a4f6f33d"]
            sent = D(next(o["sats"] for o in source["outputs"] if o["vout"] == 0)) / 10**8
            assert sent == D("0.001")
            assert t["time_ms"] > milliseconds(source["confirmed_at"])
            events.append(dict(time_ms=t["time_ms"], kind="fee_btc", id=t["hash"],
                               quantity_btc=str(sent - D(t["amount_btc"]))))
    # Independently reconcile each HL account, checking every fill's opening position.
    for _, kind, r in sorted(account_events, key=lambda x: x[0]):
        if kind == "fill":
            assert accounts[r["account"]] == D(r["start_position_btc"]), "Missing/reordered fills or transfers"
            accounts[r["account"]] += D(r["gross_btc"]) - D(r["fee"]) if r["side"] == "buy" else -D(r["gross_btc"])
        else:
            amount = D(r["amount_btc"])
            if r["from_address"] in accounts:
                accounts[r["from_address"]] -= amount
            if r["to_address"] in accounts:
                accounts[r["to_address"]] += amount
        assert all(q >= 0 for q in accounts.values()), "Negative HL balance"
    assert all(accounts[a["address"]] == D(a["closing_ubtc"]) == 0 for a in hl["accounts"])
    for t in h["transactions"]:
        at = milliseconds(t["confirmed_at"])
        if t["kind"] == "external_receipt":
            if t["txid"] in matches.values():
                continue
            r = receipts[t["txid"]]
            assert r["source"].startswith(("Garden", "Symbiosis")) and r["cost_usdt"] is not None
            events.append(dict(time_ms=at, kind="acquire", id=t["txid"],
                quantity_btc=str(D(t["owned_output_sats"]) / 10**8),
                quote_currency="USDT", quote_amount=r["cost_usdt"]))
        else:
            assert not t["mixed_inputs"]
            events.append(dict(time_ms=at, kind="fee_btc", id=t["txid"],
                               quantity_btc=str(D(t["network_fee_sats"]) / 10**8)))
    events.sort(key=lambda e: (e["time_ms"], e["id"]))
    results = {}
    for policy, capitalize in [("expense_transfer_fees", False), ("capitalize_identified_transfer_fees", True)]:
        pool = Pool(capitalize)
        traces = []
        for event in events:
            kind = event["kind"]
            removed = None
            if kind == "acquire":
                pool.add(D(event["quantity_btc"]), D(event["quote_amount"]), event["quote_currency"])
            elif kind == "buy":
                pool.add(D(event["gross_btc"]) - D(event["fee"]), D(event["quote_amount"]), "USDC")
            elif kind == "sell":
                removed = pool.remove(D(event["gross_btc"]))
                for currency in pool.realized:
                    pool.realized[currency] -= removed[currency]
                pool.realized["USDC"] += D(event["quote_amount"]) - D(event["fee"])
            elif kind == "fee_quote":
                if capitalize:
                    pool.cost[event["currency"]] += D(event["amount"])
            else:
                removed = pool.remove(D(event["quantity_btc"]), fee=kind == "fee_btc")
            assert pool.quantity >= 0 and all(x >= 0 for x in pool.cost.values())
            traces.append(dict(event=event, pool_btc=str(pool.quantity),
                               basis_native={k: str(v) for k, v in pool.cost.items()},
                               basis_removed_native={k: str(v) for k, v in removed.items()} if removed else None))
        balance = D(sum(h["confirmed_balances_sats"].values())) / 10**8
        assert pool.quantity == balance, "Global quantity does not reconcile to BTC wallets"
        results[policy] = dict(remaining_btc=str(pool.quantity),
            remaining_basis_native={k: str(v) for k, v in pool.cost.items()},
            estimated_basis_usdt_at_usdc_parity=str(sum(pool.cost.values())),
            estimated_average_usdt_per_btc_at_usdc_parity=str(sum(pool.cost.values()) / pool.quantity),
            realized_sale_pnl_native={k: str(v) for k, v in pool.realized.items()}, events=traces)
    output = dict(schema_version=2, scope="Four user-confirmed BTC addresses plus two supplied HL accounts",
        acquisition_provenance_complete_for_scope=True, exact_average_usdt_per_btc=None,
        as_of=h["fetched_at"], confirmed_balance_btc=str(D(sum(h["confirmed_balances_sats"].values()))/10**8),
        conversion_assumption="1 USDC = 1 USDT, explicitly approximate; native cost components retained",
        accounting="One moving-weighted-average pool of BTC and UBTC across tracked accounts; internal transfers preserve basis",
        caveats=["Ethereum transaction/approval gas not valued; capitalized-fee result is not a complete all-in cost.",
                 "Earlier 0.3 USDT failed-route/bridge difference excluded pending attribution.",
                 "Includes 99584 sats in the additional cold-wallet address confirmed by the user.",
                 "Zero-hash HL fill identified by public trade ID; do not deduplicate fills by hash alone."],
        reconciled_hl_accounts={k: str(v) for k, v in accounts.items()}, bridge_routes=routes, policies=results)
    if write:
        save("reconciliation.json", output)
        export_acquisitions(ledger, hl)
    return output


def export_acquisitions(ledger, hl):
    records = []
    for r in ledger["receipts"]:
        if r["cost_usdt"] is None:
            continue
        qty = D(r["received_sats"]) / 10**8
        records.append(dict(executed_at=r["received_at"], venue=r["source"],
            gross_btc="", btc_fee="", net_acquired_btc=str(qty), quote_currency="USDT",
            quote_spent=r["cost_usdt"], effective_quote_per_net_btc=str(D(r["cost_usdt"]) / qty),
            source_reference=r.get("source_txid", r["source_evidence"][1]),
            note="Net delivery amount; Ethereum gas excluded"))
    for f in hl["fills"]:
        if f["side"] != "buy":
            continue
        qty, fee = D(f["gross_btc"]), D(f["fee"])
        cost = qty * D(f["price_usdc"])
        records.append(dict(executed_at=f["executed_at"], venue="Hyperliquid " + f["account"],
            gross_btc=str(qty), btc_fee=str(fee), net_acquired_btc=str(qty-fee),
            quote_currency="USDC", quote_spent=str(cost), effective_quote_per_net_btc=str(cost/(qty-fee)),
            source_reference=f["hash"] + " trade_id=" + f["trade_id"],
            note="USDC quote; USDT conversion is approximate"))
    for r in read("external-acquisitions.json")["acquisitions"]:
        records.append(dict(executed_at=r["acquired_at"], venue=r["venue"], gross_btc="", btc_fee="",
            net_acquired_btc=r["net_btc"], quote_currency=r["quote_currency"], quote_spent=r["quote_spent"],
            effective_quote_per_net_btc=str(D(r["quote_spent"])/D(r["net_btc"])),
            source_reference=r["source_txid"], note="Source Polygon USDT spend; net HyperEVM UBTC delivery; gas excluded"))
    records.sort(key=lambda row: row["executed_at"])
    with (DATA / "acquisitions.csv").open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=list(records[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["import-private", "import-public", "calculate", "verify"])
    parser.add_argument("--directory", type=Path, default=ROOT)
    args = parser.parse_args()
    if args.command == "import-private":
        import_private(args.directory)
    elif args.command == "import-public":
        import_public(args.directory)
    else:
        result = reconcile(write=args.command == "calculate")
        if args.command == "verify":
            assert result == read("reconciliation.json"), "Stored reconciliation differs; recalculate"
        print(json.dumps({k: {a: b for a, b in v.items() if a != "events"}
                          for k, v in result["policies"].items()}, indent=2))
