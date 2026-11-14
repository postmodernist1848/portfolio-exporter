"""Offline checks for synthetic exposure and non-duplicated derivative PnL."""
import runpy
import unittest
from decimal import Decimal as D
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).with_name("reconcile-btc-hedge.py")))


class HedgeAccountingTests(unittest.TestCase):
    def example(self, funding=False, carry=False):
        physical = [dict(time_ms=0, id="physical", kind="acquire", quantity_btc="1",
                         quote_amount="40000", quote_currency="USDT")]
        hedge = [dict(time_ms=1, id="open", action="Sell", btc_equivalent="0.5",
                      notional_usdt="25000", fee_paid_usdt="10", episode="test"),
                 dict(time_ms=3, id="close", action="Buy", btc_equivalent="0.5",
                      notional_usdt="30000", fee_paid_usdt="15", episode="test")]
        if funding:
            hedge.append(dict(time_ms=2, id="funding", action="Funding fee income",
                              fee_paid_usdt="0", cash_change_usdt="10", episode="test"))
        return MODULE["replay"](physical, hedge, False, carry)

    def test_synthetic_sell_rebuy_resets_only_hedged_basis(self):
        r = self.example()
        self.assertEqual(D(r["remaining_btc"]), D("1"))
        self.assertEqual(D(r["remaining_basis_native"]["USDT"]), D("50015"))
        self.assertEqual(D(r["synthetic_realized_native"]["USDT"]), D("4990"))
        # 4990 realized - 10015 additional basis = -5025 actual hedge loss.
        self.assertEqual(D(r["synthetic_realized_native"]["USDT"])
                         - (D(r["remaining_basis_native"]["USDT"])-D("40000")), D("-5025"))

    def test_funding_recognized_once_or_credited_at_close(self):
        separate, carried = self.example(True), self.example(True, True)
        self.assertEqual(D(separate["remaining_basis_native"]["USDT"]), D("50015"))
        self.assertEqual(D(separate["synthetic_realized_native"]["USDT"]), D("5000"))
        self.assertEqual(D(carried["remaining_basis_native"]["USDT"]), D("50005"))
        self.assertEqual(D(carried["synthetic_realized_native"]["USDT"]), D("4990"))

    def test_exported_contract_units_match_both_closing_pnls(self):
        for ep in MODULE["read"]("hedge-evidence.json")["episodes"]:
            sells = sum(D(e["notional_usdt"]) for e in ep["events"] if e["action"] == "Sell")
            buys = sum(D(e["notional_usdt"]) for e in ep["events"] if e["action"] == "Buy")
            self.assertEqual(sells-buys, D(ep["reported_price_pnl_usdt"]))
            self.assertEqual(D(ep["events"][-1]["short_position_after_btc"]), D(0))

    def test_real_wallet_quantity_and_total_pnl_reconcile(self):
        result = MODULE["calculate"]()
        for s in result["scenarios"].values():
            for p in s["policies"].values():
                self.assertEqual(D(p["remaining_btc"]), D("0.12736999"))
                self.assertLess(abs(D(p["pnl_identity_residual_usdt_at_parity"])), D("0.00000002"))
