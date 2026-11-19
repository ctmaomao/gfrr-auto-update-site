"""No-network regression tests for the historical NOD aggregate verifier."""

import csv
import hashlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest
import zipfile


MODULE = runpy.run_path(str(
    Path(__file__).resolve().parents[2] / "scripts/oil-directional/check-nod-facility-catalog-audit.py"
))
summarize, check, UNKNOWN = (MODULE[name] for name in ("summarize", "check", "UNKNOWN"))
BASE = {
    "fclNpdidFacility": "1", "fclNationCode2": "NO", "fclFixedOrMoveable": "FIXED",
    "fclSurface": "Y", "fclKind": "EXAMPLE KIND", "fclFunctions": "PROCESSING - OIL PRODUCER",
    "fclPhase": "IN SERVICE", "fclStartupDate": "2020-01-01", "fclDateShutdown": "",
    "fclDateRemoved": "", "fclNpdidBelongsTo": "100", "unusedColumn": "not projected",
}


def make_csv(*overrides):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, BASE)
    writer.writeheader()
    for index, fields in enumerate(overrides, 1):
        writer.writerow({**BASE, "fclNpdidFacility": str(index), **fields})
    stream.seek(0)
    return stream


class NodFacilityAuditTests(unittest.TestCase):
    def test_scope_distinguishes_function_and_phase_from_parent_groups(self):
        result = summarize(make_csv(
            {}, {},
            {"fclPhase": "SHUT DOWN", "fclDateShutdown": "2025-01-01"},
            {"fclPhase": "IN SERVICE", "fclDateRemoved": "2025-01-02", "fclNpdidBelongsTo": "",
             "fclStartupDate": ""},
            {"fclFunctions": "NOT OIL PRODUCER"},
            {"fclSurface": "N"}, {"fclKind": "ONSHORE FACILITY"},
            {"fclFixedOrMoveable": "MOVEABLE"}, {"fclNationCode2": "GB"},
        ))
        self.assertEqual(result, {
            "sourceRecords": 9, "uniqueRegulatorIds": 9,
            "norwayRegisteredFixedSurfaceNonOnshoreKind": 5, "oilProducerFunction": 4,
            "oilProducerRegisterPhase": {"IN SERVICE": 3, "SHUT DOWN": 1},
            "inServiceWithStartupDate": 2, "inServiceWithShutdownOrRemovalDate": 1,
            "inServiceSharedParentGroups": 1, "inServiceRowsInSharedParentGroups": 2,
        })

    def test_malformed_rows_and_duplicate_ids_fail_closed(self):
        for stream in (make_csv({}, {"fclNpdidFacility": "1"}), make_csv({"fclNpdidFacility": ""}),
                       io.StringIO("fclNpdidFacility\n1\n"),
                       io.StringIO(make_csv().getvalue() + "1,NO\n")):
            with self.subTest(), self.assertRaises(ValueError):
                summarize(stream)

    def test_byte_pin_and_unknown_guard(self):
        with tempfile.TemporaryDirectory() as path:
            archive, fixture = (Path(path) / name for name in ("input.zip", "fixture.json"))
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("fclPoint.csv", make_csv({}).getvalue())
            data = archive.read_bytes()
            audit = {
                "source": {"byteLength": len(data), "sha256": hashlib.sha256(data).hexdigest()},
                "counts": summarize(make_csv({})), **dict.fromkeys(UNKNOWN),
            }
            fixture.write_text(json.dumps(audit), encoding="utf-8")
            check(archive, fixture)
            archive.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                check(archive, fixture)
            archive.write_bytes(data)
            audit["counts"]["sourceRecords"] = True
            fixture.write_text(json.dumps(audit), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "counts"):
                check(archive, fixture)
            audit["counts"] = summarize(make_csv({}))
            audit["currentPhysicalOperation"] = 1
            fixture.write_text(json.dumps(audit), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must stay unknown"):
                check(archive, fixture)


if __name__ == "__main__":
    unittest.main()
