"""Offline accounting tests: python3 -m unittest discover -s scripts -p 'test_reconcile_btc.py'."""
import runpy
import unittest
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
            self.assertEqual(D(policy["remaining_btc"]), D("0.12737763"))
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
