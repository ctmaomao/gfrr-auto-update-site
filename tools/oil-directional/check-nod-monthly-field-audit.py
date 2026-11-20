"""Replay a pinned, geometry-free historical SODIR production aggregate offline."""

from collections import Counter
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys


FIXTURE = Path(__file__).resolve().parents[2] / "docs/fixtures/oil-thermal/nod-field-production-2026-08.audit.json"


def rows(path, source):
    with Path(path).open("rb") as stream:
        raw = stream.read(source["bytes"] + 1)
    if len(raw) != source["bytes"] or hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("source bytes do not match the pinned snapshot")
    payload = json.loads(raw, parse_float=Decimal)
    if payload.get("error") or payload.get("exceededTransferLimit"):
        raise ValueError("incomplete source response")
    for row in payload["features"]:
        if set(row) != {"attributes"}:
            raise ValueError("expected only nonspatial attributes")
        yield row["attributes"]


def summarize(registry, production, period):
    phases = {}
    for row in registry:
        key = row["fldNpdidField"]
        if type(key) is not int or key <= 0 or key in phases:
            raise ValueError("invalid or duplicate field identity")
        phases[key] = row["fldCurrentActivitySatus"]
    counts = Counter()
    totals = Counter()
    matched = set()
    seen = set()
    for row in production:
        if [row["prfYear"], row["prfMonth"]] != period:
            raise ValueError("unexpected production period")
        kind, key = row["prfInformationCarrierKind"], row["prfNpdidInformationCarrier"]
        if kind not in {"FIELD", "DISCOVERY"} or type(key) is not int or key <= 0 or (kind, key) in seen:
            raise ValueError("invalid or duplicate period identity")
        seen.add((kind, key))
        value = row["prfPrdOilNetMillSm3"]
        if value is not None and (type(value) not in {Decimal, int} or not Decimal(value).is_finite()):
            raise ValueError("invalid monthly volume")
        counts[kind + "Rows"] += 1
        if value is not None:
            totals[kind] += value
        if kind == "FIELD":
            state = "missingValue" if value is None else "positive" if value > 0 else "zero" if value == 0 else "negative"
            phase = phases[key] if key in phases else "unmatched"
            if key in phases:
                matched.add(key)
            counts[state] += 1
            counts[f"{phase}:{state}"] += 1
    for key in phases.keys() - matched:
        counts[f"{phases[key]}:noMonthlyRow"] += 1
    return {"registryRows": len(phases), "matchedFieldRows": len(matched), "counts": dict(counts),
            "oilNetMillionSm3": {kind: str(totals[kind]) for kind in sorted(totals)}}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python3 tools/oil-directional/check-nod-monthly-field-audit.py registry.json monthly.json")
    try:
        audit = json.loads(FIXTURE.read_text(encoding="utf-8"))
        registry, production = [rows(path, source) for path, source in zip(sys.argv[1:], audit["sources"], strict=True)]
        if summarize(registry, production, audit["period"]) != audit["aggregate"]:
            raise ValueError("aggregate mismatch")
    except (ValueError, KeyError, TypeError, OSError) as error:
        sys.exit("SODIR field audit failed: " + (str(error) if type(error) is ValueError else type(error).__name__))
    print("SODIR field audit passed (monthly historical aggregates; no facility or coverage inference)")
