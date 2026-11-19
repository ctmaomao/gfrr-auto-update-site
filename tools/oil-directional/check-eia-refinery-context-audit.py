"""Reproduce the aggregate fixture from a local, byte-pinned EIA Table 1 PDF."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "docs/fixtures/oil-thermal/eia-refinery-capacity-2026.audit.json"
)


def check(pdf: Path) -> None:
    audit = json.loads(FIXTURE.read_text(encoding="utf-8"))
    source = audit["source"]
    if pdf.stat().st_size != source["byteLength"]:
        raise ValueError("source PDF size mismatch")
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError("source PDF SHA-256 mismatch")

    page = subprocess.run(
        ["pdftotext", "-f", "1", "-l", "1", "-raw", str(pdf.resolve()), "-"],
        check=True, capture_output=True, text=True, encoding="utf-8",
    ).stdout
    title = "Number and Capacity of Operable Petroleum Refineries by PAD District and State"
    if f"{title} as of January 1, 2026" not in page or source["asOfDate"] != "2026-01-01":
        raise ValueError("survey snapshot date mismatch")
    if source["releaseDate"] != "2026-06-26":
        raise ValueError("report release date mismatch")

    expected = audit["publishedRefineryCounts"]
    if set(expected) != {"PAD District III", "Texas", "Louisiana"}:
        raise ValueError("unexpected region set")
    for region, counts in expected.items():
        # The pinned page's raw text emits the nine numeric columns before each label.
        rows = re.findall(
            rf"^(\d+) (\d+) (\d+)(?: [\d,]+){{6}}\n\.+\n{re.escape(region)}\.*$",
            page, flags=re.MULTILINE,
        )
        if len(rows) != 1 or counts != dict(
            zip(("operable", "operating", "idle"), map(int, rows[0]))
        ):
            raise ValueError(f"unexpected Table 1 counts for {region}")

    for key in ("currentOperatingStatus", "qualifiedObservationCoverage", "thermalWatchCoverageRatio"):
        if audit[key] is not None:
            raise ValueError(f"{key} must remain unknown")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 tools/oil-directional/check-eia-refinery-context-audit.py /path/to/table1.pdf")
    try:
        check(Path(sys.argv[1]))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"EIA refinery context audit failed: {error}")
    print("EIA refinery context audit passed (three historical regional counts; no coverage inference)")
