"""Check historical regulator catalogue counts from one locally supplied ZIP."""

from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile


FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "docs/fixtures/oil-thermal/nod-fixed-surface-oil-producers-2026-11.audit.json"
)
COLUMNS = {
    "fclNpdidFacility", "fclNationCode2", "fclFixedOrMoveable", "fclSurface",
    "fclKind", "fclFunctions", "fclPhase", "fclStartupDate", "fclDateShutdown",
    "fclDateRemoved", "fclNpdidBelongsTo",
}
UNKNOWN = (
    "currentPhysicalOperation", "currentProductionVolume", "qualifiedObservationCoverage",
    "thermalWatchCoverageRatio", "ogimCrosswalk",
)


def summarize(stream):
    reader = csv.DictReader(stream, strict=True)
    fields = reader.fieldnames or []
    if not COLUMNS.issubset(fields) or len(set(fields)) != len(fields):
        raise ValueError("invalid source columns")

    ids = set()
    scope_count = 0
    phases = Counter()
    startup = shutdown_or_removal = 0
    parents = Counter()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("malformed source row")
        key = row["fclNpdidFacility"]
        if not re.fullmatch(r"[1-9][0-9]*", key) or key in ids:
            raise ValueError("missing, invalid or duplicate regulator identity")
        ids.add(key)
        if not (
            row["fclNationCode2"] == "NO" and row["fclFixedOrMoveable"] == "FIXED"
            and row["fclSurface"] == "Y" and row["fclKind"] not in ("", "ONSHORE FACILITY")
        ):
            continue
        scope_count += 1
        if "OIL PRODUCER" not in row["fclFunctions"].split(" - "):
            continue
        phase = row["fclPhase"]
        phases[phase] += 1
        if phase == "IN SERVICE":
            startup += bool(row["fclStartupDate"])
            shutdown_or_removal += bool(row["fclDateShutdown"] or row["fclDateRemoved"])
            if row["fclNpdidBelongsTo"]:
                parents[row["fclNpdidBelongsTo"]] += 1

    return {
        "sourceRecords": len(ids),
        "uniqueRegulatorIds": len(ids),
        "norwayRegisteredFixedSurfaceNonOnshoreKind": scope_count,
        "oilProducerFunction": sum(phases.values()),
        "oilProducerRegisterPhase": dict(phases),
        "inServiceWithStartupDate": startup,
        "inServiceWithShutdownOrRemovalDate": shutdown_or_removal,
        "inServiceSharedParentGroups": sum(value > 1 for value in parents.values()),
        "inServiceRowsInSharedParentGroups": sum(value for value in parents.values() if value > 1),
    }


def check(archive, fixture=FIXTURE):
    audit = json.loads(fixture.read_text(encoding="utf-8"))
    source = audit["source"]
    with archive.open("rb") as handle:
        data = handle.read(source["byteLength"] + 1)
    if len(data) != source["byteLength"]:
        raise ValueError("source ZIP size mismatch")
    if hashlib.sha256(data).hexdigest() != source["sha256"]:
        raise ValueError("source ZIP SHA-256 mismatch")

    with zipfile.ZipFile(io.BytesIO(data)) as bundle:
        if bundle.namelist() != ["fclPoint.csv"]:
            raise ValueError("unexpected ZIP members")
        with bundle.open("fclPoint.csv") as member:
            with io.TextIOWrapper(member, encoding="utf-8-sig", newline="") as stream:
                counts = summarize(stream)

    if json.dumps(counts, sort_keys=True) != json.dumps(audit["counts"], sort_keys=True):
        raise ValueError("aggregate counts mismatch")
    if any(audit[key] is not None for key in UNKNOWN):
        raise ValueError("operation, observations, coverage and identity crosswalk must stay unknown")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/oil-directional/check-nod-facility-catalog-audit.py /path/to/fclPoint.zip")
    try:
        check(Path(sys.argv[1]))
    except (ValueError, KeyError, OSError, csv.Error, zipfile.BadZipFile) as error:
        # Raw parser and OS errors can contain local paths or source data; do not print them.
        summary = str(error) if type(error) is ValueError else type(error).__name__
        sys.exit(f"NOD facility catalogue audit failed: {summary}")
    print("NOD facility catalogue audit passed (historical aggregates; no operational or coverage inference)")
