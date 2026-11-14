"""Offline accounting tests: python3 -m unittest discover -s scripts -p 'test_reconcile_btc.py'."""
import runpy
import unittest
from unittest.mock import patch
from copy import deepcopy
from decimal import Decimal as D
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).with_name("reconcile-btc.py")))
Pool = MODULE["Pool"]


class AccountingTests(unittest.TestCase):
    def test_sale_removes_proportional_native_basis(self):
        pool = Pool()
        pool.add(D("1"), D("40000"), "USDT")
        pool.add(D("1"), D("60000"), "USDC")
        removed = pool.remove(D("0.5"))
        self.assertEqual(removed, {"USDT": D("10000"), "USDC": D("15000")})
        self.assertEqual(pool.quantity, D("1.5"))
        self.assertEqual(pool.cost, {"USDT": D("30000"), "USDC": D("45000")})

    def test_fee_policies_are_distinct(self):
        expense, capitalized = Pool(), Pool(True)
        for pool in (expense, capitalized):
            pool.add(D("1"), D("50000"), "USDT")
            pool.remove(D("0.01"), fee=True)
        self.assertEqual(expense.cost["USDT"], D("49500"))
        self.assertEqual(capitalized.cost["USDT"], D("50000"))
        self.assertEqual(expense.quantity, capitalized.quantity)

    def test_outside_scope_transfer_keeps_basis_separate(self):
        pool = Pool(True)
        pool.add(D("1"), D("50000"), "USDT")
        removed = pool.remove(D("0.1"))
        self.assertEqual(removed["USDT"], D("5000"))
        self.assertEqual(pool.cost["USDT"], D("45000"))
        with self.assertRaises(AssertionError):
            pool.remove(D("1"))

    def test_all_public_accounts_and_wallets_reconcile(self):
        result = MODULE["reconcile"]()
        self.assertEqual(set(result["reconciled_hl_accounts"].values()), {"0E-10"})
        self.assertEqual(len(result["bridge_routes"]), 4)
        for policy in result["policies"].values():
            self.assertEqual(D(policy["remaining_btc"]), D("0.12736999"))
        self.assertIsNone(result["exact_average_usdt_per_btc"])

    def test_november_across_purchase_and_bridge_loss(self):
        acquisitions = MODULE["read"]("external-acquisitions.json")["acquisitions"]
        self.assertEqual(len(acquisitions), 1)
        self.assertEqual(D(acquisitions[0]["quote_spent"]), D("1008.6"))
        self.assertEqual(D(acquisitions[0]["net_btc"]), D("0.01460838"))
        result = MODULE["reconcile"]()
        route = next(x for x in result["bridge_routes"] if x["btc_txid"].startswith("538993"))
        self.assertEqual(D(route["hl_debit_btc"]), D("0.0258330811"))
        self.assertEqual(route["received_sats"], 2582844)
        self.assertEqual(D(route["bridge_loss_btc"]), D("0.0000046411"))


    def test_consolidation_preserves_basis_and_reduces_quantity_by_fee(self):
        result = MODULE["reconcile"]()
        fee = D("0.00000764")
        for name, policy in result["policies"].items():
            previous, current = policy["events"][-2:]
            self.assertEqual(current["event"]["id"], "639ea185f678c76ec940b518c44e5aeaf83b11aa663c28f0c9bbb3b4495564c4")
            self.assertEqual(D(previous["pool_btc"]) - D(current["pool_btc"]), fee)
            if name == "capitalize_identified_transfer_fees":
                self.assertEqual(previous["basis_native"], current["basis_native"])
            else:
                before = sum(map(D, previous["basis_native"].values())) / D(previous["pool_btc"])
                after = sum(map(D, current["basis_native"].values())) / D(current["pool_btc"])
                self.assertLess(abs(before - after), D("1e-30"))

    def test_unknown_outgoing_is_rejected_before_accounting(self):
        original_read = MODULE["reconcile"].__globals__["read"]
        def changed_read(name):
            value = deepcopy(original_read(name))
            if name == "bitcoin-history.json":
                value["transactions"][-1]["outputs"][0]["address"] = "unknown-owner"
            return value
        with patch.dict(MODULE["reconcile"].__globals__, read=changed_read):
            with self.assertRaisesRegex(AssertionError, "Unclassified outgoing BTC"):
                MODULE["reconcile"]()
