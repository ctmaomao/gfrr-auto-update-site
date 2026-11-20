from io import BytesIO
import unittest
from unittest.mock import patch

from census_import_cost import RECORD_BYTES, summarize

MONTH = "2025-11"


def row(code=b"2709001000", period=b"202511", kg=b"1000", usd=b"2000", end=b"\n"):
    record = bytearray(b" " * RECORD_BYTES)
    record[:10] = code
    record[66:72] = period
    record[327:342] = kg.rjust(15)
    record[342:357] = usd.rjust(15)
    # Different values in the adjacent and YTD fields must not enter calculation.
    record[312:327] = b"111111111111111"
    record[357:372] = b"222222222222222"
    record[657:672] = b"333333333333333"
    record[672:687] = b"444444444444444"
    return bytes(record) + end


class CensusImportCostTests(unittest.TestCase):
    def parse(self, data, period=MONTH):
        return summarize(BytesIO(data), period)

    def test_november_control_totals_and_weighting(self):
        result = self.parse(
            row(code=b"2709002000", kg=b"003131046060", usd=b"69629980", end=b"\r\n")
            + row(code=b"2710191000")
            + row(kg=b"5000000000", usd=b"70000000", end=b"")
        )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["vesselShippingWeightKg"], 8_131_046_060)
        self.assertEqual(result["vesselImportChargesUsd"], 139_629_980)
        self.assertEqual(result["usdPerMetricTonne"], 17.17245)
        self.assertEqual(result["hts10Codes"], ["2709001000", "2709002000"])

    def test_no_false_zero_or_partial_value(self):
        for data, reason in (
            (b"", "empty_member"),
            (row(code=b"2710191000"), "no_crude_hts10"),
            (row(kg=b"0", usd=b"0"), "no_vessel_weight"),
            (row() + row(code=b"2709002000", kg=b""), "missing_vessel_field"),
            (row(kg=b"0", usd=b"123"), "inconsistent_vessel_fields"),
        ):
            with self.subTest(reason=reason):
                value = self.parse(data)
                self.assertEqual((value["status"], value["reason"]), ("missing", reason))
                self.assertIsNone(value["usdPerMetricTonne"])
                self.assertIsNone(value["vesselImportChargesUsd"])
                self.assertIsNone(value["vesselShippingWeightKg"])

    def test_corruption_or_mixed_periods_fail_closed(self):
        for data, reason in (
            (row() + row()[:400], "bad_record_layout"),
            (row(end=b"") + b" " * 10000, "bad_record_layout"),
            (row(code=b"270900abc0"), "invalid_hts10"),
            (row() + row(code=b"2710191000", period=b"202510"), "unexpected_record_period"),
            (row() + row(), "duplicate_crude_hts10"),
            (row(kg=b"+123"), "invalid_vessel_field"),
        ):
            with self.subTest(reason=reason):
                value = self.parse(data)
                self.assertEqual((value["status"], value["reason"]), ("invalid", reason))
                self.assertIsNone(value["usdPerMetricTonne"])

    def test_enforces_byte_budget_and_input_period(self):
        with patch("census_import_cost.MAX_BYTES", RECORD_BYTES):
            value = self.parse(row())
        self.assertEqual((value["status"], value["reason"]),
                         ("invalid", "member_byte_limit_exceeded"))
        for period in ("2025-00", "2025-13", "2025-1", "202511", None):
            with self.subTest(period=period), self.assertRaises(ValueError):
                self.parse(b"", period)


if __name__ == "__main__":
    unittest.main()
