from importlib.machinery import SourceFileLoader
from importlib.util import spec_from_loader, module_from_spec
from io import BytesIO
from pathlib import Path
import re
import unittest
from zipfile import ZipFile, ZIP_DEFLATED

from test_census_import_cost import row

path = Path(__file__).with_name("fetch-census-import-cost.py")
spec = spec_from_loader("fetch_census_import_cost", SourceFileLoader("fetch_census_import_cost", str(path)))
collector = module_from_spec(spec)
spec.loader.exec_module(collector)


def mock_server(raw, *, wrong_range=False, wrong_version=False, full_response=False):
    def request(req, timeout):
        headers = dict(req.header_items())
        if req.method == "HEAD":
            response = BytesIO()
            response.status = 200
            response.headers = {"Content-Length": str(len(raw)), "ETag": '"one"'}
            return response
        assert headers["If-match"] == '"one"'
        a, b = map(int, re.fullmatch("bytes=(.+)-(.+)", headers["Range"]).groups())
        response = BytesIO(raw[a:b + 1])
        response.status = 200 if full_response else 206
        response.headers = {"Content-Range": f"bytes {a}-{b}/{len(raw) + wrong_range}",
                            "ETag": '"two"' if wrong_version else '"one"'}
        return response
    return request


class TestFetchCensus(unittest.TestCase):
    def test_only_national_member_and_bounded_ranges(self):
        tmp = BytesIO()
        with ZipFile(tmp, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("IMP_COMM.txt", row())
            archive.writestr("IMP_DETL.txt", b"irrelevant")
        answer = collector.collect("2025-11", mock_server(tmp.getvalue()))
        self.assertEqual(answer["result"]["usdPerMetricTonne"], 2000)
        self.assertEqual(answer["requestCount"], 2)
        self.assertFalse(answer["eligibleForMainScore"])
        self.assertFalse(answer["eligibleForPricePrediction"])

    def test_last_modified_varies_without_etag(self):
        requested = []
        def request(req, timeout):
            headers = dict(req.header_items())
            if req.method == "HEAD":
                result = BytesIO()
                result.status = 200
                result.headers = {"Content-Length": "200000", "Last-Modified": "head-cache"}
                return result
            requested.append(headers.get("If-unmodified-since"))
            a, b = map(int, re.fullmatch("bytes=(.+)-(.+)", headers["Range"]).groups())
            result = BytesIO(b"x" * (b - a + 1))
            result.status = 206
            result.headers = {"Content-Range": f"bytes {a}-{b}/200000", "Last-Modified": f"range-cache-{a}"}
            return result
        remote = collector.RangeZip("https://example.invalid", request)
        remote.read(1)
        remote.seek(100000)
        remote.read(1)
        self.assertEqual(requested, [None, None])
        self.assertEqual(len(remote.last_modified), 2)

    def test_rejects_changed_member_directory_without_etag(self):
        tmp = BytesIO()
        with ZipFile(tmp, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("IMP_COMM.txt", row())
        original = tmp.getvalue()
        edited = bytearray(original)
        edited[edited.index(b"PK\x01\x02") + 16] ^= 1
        read_count = 0
        def request(req, timeout):
            nonlocal read_count
            if req.method == "HEAD":
                result = BytesIO()
                result.status = 200
                result.headers = {"Content-Length": str(len(original))}
                return result
            read_count += 1
            result = BytesIO(original if read_count == 1 else edited)
            result.status = 206
            result.headers = {"Content-Range": f"bytes 0-{len(original)-1}/{len(original)}"}
            return result
        with self.assertRaisesRegex(ValueError, "member identity changed"):
            collector.collect("2025-11", request)

    def test_rejects_ignored_ranges_inconsistent_version_and_length(self):
        for issue in ("wrong_range", "wrong_version", "full_response"):
            with self.subTest(issue=issue), self.assertRaisesRegex(ValueError, "exact requested range"):
                remote = collector.RangeZip("https://example.invalid", mock_server(b"123", **{issue: True}))
                remote.read(1)


if __name__ == "__main__":
    unittest.main()
