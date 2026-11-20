"""Offline shadow parser for the U.S. Census national IMP_COMM.TXT member.

A retrospective vessel import charges proxy, not a route quote or a TCE.
No archive extraction, network access, scoring, or output files.
"""

import argparse
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP

LAYOUT = "https://www.census.gov/foreign-trade/reference/products/layouts/imdb.html"
DEFINITIONS = "https://www.census.gov/foreign-trade/reference/definitions/index.html"
RECORD_BYTES = 732
MAX_BYTES = 32 * 1024 * 1024
HS6 = b"270900"
PERIOD = re.compile(r"[1-9][0-9]{3}-(?:0[1-9]|1[0-2])")


def summarize(stream, period_yyyy_mm):
    """Read a binary, single-month IMP_COMM.TXT stream. Return compact JSON data."""
    if not isinstance(period_yyyy_mm, str) or not PERIOD.fullmatch(period_yyyy_mm):
        raise ValueError("period must be YYYY-MM")

    period = period_yyyy_mm.replace("-", "").encode("ascii")
    result = {
        "schemaVersion": "census-crude-vessel-import-cost-shadow-v1",
        "status": "missing",
        "reason": None,
        "period": period_yyyy_mm,
        "source": "U.S. Census Bureau IMDB IMP_COMM.TXT",
        "layoutUrl": LAYOUT,
        "definitionsUrl": DEFINITIONS,
        "scope": "national U.S. general imports by vessel; HS 270900",
        "measure": "Census vessel import charges; not a route quote, TCE, or spot rate",
        "vesselShippingWeightKg": None,
        "vesselImportChargesUsd": None,
        "usdPerMetricTonne": None,
        "hts10Codes": [],
    }

    def finish(status, reason):
        return {**result, "status": status, "reason": reason}

    size = weight = charges = 0
    codes = set()
    while raw := stream.readline(RECORD_BYTES + 3):
        size += len(raw)
        if size > MAX_BYTES:
            return finish("invalid", "member_byte_limit_exceeded")
        row = raw.removesuffix(b"\n").removesuffix(b"\r") if raw.endswith(b"\n") else raw
        if len(row) != RECORD_BYTES or not row.isascii():
            return finish("invalid", "bad_record_layout")
        code = row[:10]  # 1–10, inclusive
        if not code.isdigit():
            return finish("invalid", "invalid_hts10")
        if row[66:72] != period:  # 67–72, YYYYMM; never read YTD columns
            return finish("invalid", "unexpected_record_period")
        if code[:6] != HS6:
            continue
        if code in codes:
            return finish("invalid", "duplicate_crude_hts10")
        codes.add(code)
        kg, usd = row[327:342].strip(b" "), row[342:357].strip(b" ")
        if not kg or not usd:
            return finish("missing", "missing_vessel_field")
        if not kg.isdigit() or not usd.isdigit():
            return finish("invalid", "invalid_vessel_field")
        kg, usd = int(kg), int(usd)
        if bool(kg) != bool(usd):
            return finish("missing", "inconsistent_vessel_fields")
        weight += kg
        charges += usd

    if not size:
        return finish("missing", "empty_member")
    if not codes:
        return finish("missing", "no_crude_hts10")
    if not weight:
        return finish("missing", "no_vessel_weight")

    value = (Decimal(charges * 1000) / weight).quantize(
        Decimal("0.00001"), rounding=ROUND_HALF_UP
    )
    result.update(
        vesselShippingWeightKg=weight,
        vesselImportChargesUsd=charges,
        usdPerMetricTonne=float(value),
        hts10Codes=sorted(code.decode("ascii") for code in codes),
    )
    return finish("ok", None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("period", help="required statistical month, YYYY-MM")
    parser.add_argument("path", nargs="?", default="-", help="extracted member or - for stdin")
    args = parser.parse_args()
    try:
        if args.path == "-":
            result = summarize(sys.stdin.buffer, args.period)
        else:
            with open(args.path, "rb") as stream:
                result = summarize(stream, args.period)
    except (ValueError, OSError) as exc:
        parser.exit(2, f"{exc}\n")
    print(json.dumps(result, allow_nan=False, sort_keys=True))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
