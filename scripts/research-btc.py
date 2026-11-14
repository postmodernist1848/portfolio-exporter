#!/usr/bin/env python3
"""Public-only BTC research. Never loads environment files or application config."""
import argparse
import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "research" / "btc-cost-basis" / "artifacts"
# One ownership registry shared with the research artifacts.
ADDRESSES = [x["address"] for x in json.loads((ROOT / "wallet-ownership.json").read_text())["bitcoin"]]


def get(url):
    # Public fixed hosts only; no keys, wallet signing, dotenv, or app imports.
    with urlopen(url, timeout=60) as response:
        return json.load(response)


def save(name, value):
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / name
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2) + "\n")
    tmp.replace(path)


def normalize(transactions):
    result = []
    for tx in transactions:
        if not tx["status"]["confirmed"]:
            continue
        inputs = [dict(txid=x["txid"], vout=x["vout"],
                       address=x["prevout"].get("scriptpubkey_address"),
                       sats=x["prevout"]["value"]) for x in tx["vin"]]
        outputs = [dict(vout=i, address=x.get("scriptpubkey_address"), sats=x["value"])
                   for i, x in enumerate(tx["vout"])]
        owned_in = sum(x["sats"] for x in inputs if x["address"] in ADDRESSES)
        owned_out = sum(x["sats"] for x in outputs if x["address"] in ADDRESSES)
        # Mixed ownership inputs require manual allocation, never charge the whole fee.
        mixed = bool(owned_in and any(x["address"] not in ADDRESSES for x in inputs))
        result.append(dict(
            txid=tx["txid"], block_height=tx["status"]["block_height"],
            confirmed_at=datetime.fromtimestamp(tx["status"]["block_time"], timezone.utc).isoformat(),
            inputs=inputs, outputs=outputs, owned_input_sats=owned_in,
            owned_output_sats=owned_out, wallet_delta_sats=owned_out-owned_in,
            network_fee_sats=tx["fee"], mixed_inputs=mixed,
            kind="external_receipt" if not owned_in else "wallet_spend",
            evidence_url="https://blockstream.info/tx/" + tx["txid"],
        ))
    # Resolve parent before child even for two transactions in the same block.
    pending = {x["txid"]: x for x in result}
    ordered = []
    while pending:
        ready = [x for x in pending.values()
                 if not any(i["txid"] in pending for i in x["inputs"])]
        if not ready:
            raise ValueError("Cyclic transaction dependencies")
        tx = min(ready, key=lambda x: (x["block_height"], x["txid"]))
        ordered.append(tx)
        del pending[tx["txid"]]
    return ordered


def fetch():
    txs = {}
    balances = {}
    for address in ADDRESSES:
        base = "https://blockstream.info/api/address/" + address
        stats = get(base)
        balances[address] = stats["chain_stats"]["funded_txo_sum"] - stats["chain_stats"]["spent_txo_sum"]
        cursor = ""
        while True:
            page = get(base + "/txs/chain" + ("/" + cursor if cursor else ""))
            for tx in page:
                txs[tx["txid"]] = tx
            if len(page) < 25:
                break
            next_cursor = page[-1]["txid"]
            if next_cursor == cursor:
                raise ValueError("Pagination did not advance")
            cursor = next_cursor
    history = normalize(txs.values())
    if sum(x["wallet_delta_sats"] for x in history) != sum(balances.values()):
        raise ValueError("History does not reconcile to address balances; retry after chain settles")
    save("bitcoin-history.json", dict(fetched_at=datetime.now(timezone.utc).isoformat(),
         addresses=ADDRESSES, confirmed_balances_sats=balances, transactions=history))
    # Curated ledger is intentionally never overwritten by fetch.


def verify():
    history = json.loads((ROOT / "bitcoin-history.json").read_text())
    ledger = json.loads((ROOT / "purchases.json").read_text())
    assert history["addresses"] == ADDRESSES, "Refresh history after changing ownership scope"
    txs = history["transactions"]
    assert len({x["txid"] for x in txs}) == len(txs)
    assert [x["block_height"] for x in txs] == sorted(x["block_height"] for x in txs)
    positions = {x["txid"]: i for i, x in enumerate(txs)}
    for i, tx in enumerate(txs):
        assert all(positions.get(x["txid"], -1) < i for x in tx["inputs"])
    assert not any(x["mixed_inputs"] for x in txs), "Mixed inputs need manual attribution"
    receipts = {x["txid"]: x for x in txs if x["kind"] == "external_receipt"}
    lots = ledger["receipts"]
    assert len({x["btc_txid"] for x in lots}) == len(lots)
    assert set(receipts) == {x["btc_txid"] for x in lots}, "Update curated ledger for new receipts"
    for lot in lots:
        assert lot["received_sats"] == receipts[lot["btc_txid"]]["owned_output_sats"]
        if lot["cost_usdt"] is not None:
            assert Decimal(lot["cost_usdt"]) > 0
            assert lot["source_evidence"], "Costs require evidence"
    balance = sum(x["wallet_delta_sats"] for x in txs)
    assert balance == sum(history["confirmed_balances_sats"].values())
    incoming = sum(x["received_sats"] for x in lots)
    external = sum(o["sats"] for x in txs if x["owned_input_sats"]
                   for o in x["outputs"] if o["address"] not in ADDRESSES)
    fees = sum(x["network_fee_sats"] for x in txs if x["owned_input_sats"])
    assert incoming - external - fees == balance
    known = [x for x in lots if x["cost_usdt"] is not None]
    known_sats = sum(x["received_sats"] for x in known)
    cost = sum((Decimal(x["cost_usdt"]) for x in known), Decimal(0))
    summary = dict(confirmed_balance_btc=str(Decimal(balance)/10**8),
        external_receipts_sats=incoming, outputs_outside_bitcoin_address_set_sats=external,
        owned_transaction_fees_sats=fees, direct_usdt_purchase_receipt_sats=known_sats,
        direct_usdt_purchase_cost=str(cost),
        direct_usdt_purchase_average_per_btc=(str(cost*10**8/known_sats) if known_sats else None),
        entire_wallet_average_usdt_per_btc=None,
        reason="Missing acquisition costs and unresolved outgoing payment classifications; gas/conversion also pending.")
    reconciliation_path = ROOT / "reconciliation.json"
    if reconciliation_path.exists():
        reconciliation = json.loads(reconciliation_path.read_text())
        summary.update(
            acquisition_provenance_complete_for_scope=reconciliation["acquisition_provenance_complete_for_scope"],
            estimated_average_usdt_per_btc_at_usdc_parity=reconciliation["policies"]["expense_transfer_fees"]
                ["estimated_average_usdt_per_btc_at_usdc_parity"],
            reason="All tracked receipts traced; exact USDT conversion and full gas costs remain incomplete. Run reconcile-btc.py verify.")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["fetch", "verify"])
    args = parser.parse_args()
    fetch() if args.command == "fetch" else verify()
