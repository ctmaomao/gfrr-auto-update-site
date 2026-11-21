from contextlib import redirect_stdout
from importlib.machinery import SourceFileLoader
from importlib.util import spec_from_loader, module_from_spec
from io import BytesIO, StringIO
from pathlib import Path
import re
import runpy
import subprocess
import sys
import unittest
from unittest.mock import patch
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
        with self.assertRaisesRegex(ValueError, "reason=commodity_member_identity_changed"):
            collector.collect("2025-11", request)

    def test_rejects_ignored_ranges_inconsistent_version_and_length(self):
        for issue, reason in (("wrong_range", "content_range_mismatch"),
                              ("wrong_version", "etag_mismatch"),
                              ("full_response", "unexpected_status")):
            with self.subTest(issue=issue), self.assertRaisesRegex(ValueError, f"reason={reason}"):
                remote = collector.RangeZip("https://example.invalid", mock_server(b"123", **{issue: True}))
                remote.read(1)


HEAD = b'HTTP/2 200\r\nContent-Length: 3\r\nETag: "test-private-etag"\r\n\r\n'


def curl_response(headers, body=b"", *, returncode=0):
    """Stub the subprocess, keeping the real dump-header file and parser."""
    def run(args, **kwargs):
        if headers is not None:
            Path(args[args.index("--dump-header") + 1]).write_bytes(headers)
        if returncode:
            raise subprocess.CalledProcessError(returncode, args, output=body,
                                                stderr=b"test-private-curl-stderr")
        return subprocess.CompletedProcess(args, 0, stdout=body, stderr=b"test-private-curl-stderr")
    return run


class TestCurlBoundary(unittest.TestCase):
    def test_head_metadata_and_header_parse_fail_closed(self):
        for raw, diagnostic in (
            (b"HTTP/2 200\r\nETag: private\r\n\r\n",
             "stage=head_metadata reason=content_length_missing http_status=200"),
            (b"HTTP/2 200\r\nContent-Length: private\r\n\r\n",
             "stage=head_metadata reason=content_length_invalid http_status=200"),
            (b"HTTP/2 200\r\nContent-Length: 700000001\r\n\r\n",
             "stage=head_metadata reason=content_length_out_of_bounds http_status=200"),
            (b"HTTP/2 302\r\nLocation: https://example.invalid/test-private-location\r\n\r\n",
             "stage=head_metadata reason=unexpected_status http_status=302"),
            (b"HTTP/2 test-private-status\r\nContent-Length: 3\r\n\r\n",
             "stage=head_transport reason=http_status_line_invalid"),
            (b"test-private-header-body", "stage=head_transport reason=http_status_line_missing"),
            (None, "stage=head_transport reason=header_file_unavailable"),
        ):
            with self.subTest(diagnostic=diagnostic), patch.object(
                    subprocess, "run", side_effect=curl_response(raw)) as run:
                with self.assertRaises(collector.CollectionFailure) as error:
                    collector.collect("2025-11")
                self.assertEqual(str(error.exception), diagnostic)
                self.assertEqual(run.call_count, 1)

    def test_range_envelope_failures_never_retry_or_fallback(self):
        for status, response_range, etag, encoding, body, code, diagnostic in (
            (206, "bytes 0-99/101", "test-private-etag", "identity", b"x" * 100, 0,
             "stage=range_envelope reason=content_range_mismatch http_status=206"),
            (200, "bytes 0-99/100", "test-private-etag", "identity", b"x" * 100, 0,
             "stage=range_envelope reason=unexpected_status http_status=200"),
            (206, "bytes 0-99/100", "test-private-other-etag", "identity", b"x" * 100, 0,
             "stage=range_envelope reason=etag_mismatch http_status=206"),
            (206, "bytes 0-99/100", "test-private-etag", "gzip", b"x" * 100, 0,
             "stage=range_envelope reason=content_encoding_mismatch http_status=206"),
            (206, "bytes 0-99/100", "test-private-etag", "identity", b"x" * 99, 0,
             "stage=range_envelope reason=body_length_mismatch http_status=206"),
            (200, "bytes 0-99/100", "test-private-etag", "identity", b"", 63,
             "stage=range_transport reason=curl_size_limit http_status=200"),
            (412, "bytes 0-99/100", "test-private-etag", "identity", b"", 22,
             "stage=range_transport reason=curl_http_error http_status=412"),
        ):
            header = (f"HTTP/2 {status}\r\nContent-Range: {response_range}\r\n"
                      f'ETag: "{etag}"\r\nContent-Encoding: {encoding}\r\n\r\n').encode()
            stubs = iter((curl_response(HEAD.replace(b"Length: 3", b"Length: 100")), curl_response(header, body, returncode=code)))
            with self.subTest(diagnostic=diagnostic), patch.object(
                    subprocess, "run", side_effect=lambda *a, **kw: next(stubs)(*a, **kw)) as run:
                with self.assertRaises(collector.CollectionFailure) as error:
                    collector.collect("2025-11")
                self.assertEqual(str(error.exception), diagnostic)
                self.assertEqual(run.call_count, 2)

    def test_valid_head_and_range_with_unchanged_curl_and_summary_contract(self):
        tmp = BytesIO()
        with ZipFile(tmp, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("IMP_COMM.txt", row())
            archive.writestr("IMP_DETL.txt", b"irrelevant")
        raw = tmp.getvalue()
        head = HEAD.replace(b"Length: 3", f"Length: {len(raw)}".encode())
        tail = (f"HTTP/2 206\r\nContent-Range: bytes 0-{len(raw)-1}/{len(raw)}\r\n"
                'ETag: "test-private-etag"\r\n\r\n').encode()
        stubs = iter((curl_response(b"HTTP/2 103\r\n\r\n" + head), curl_response(tail, raw)))
        with patch.object(subprocess, "run",
                          side_effect=lambda *a, **kw: next(stubs)(*a, **kw)) as run:
            answer = collector.collect("2025-11")
        self.assertEqual(run.call_count, 2)
        base = ["curl", "-q", "--silent", "--show-error", "--fail", "--suppress-connect-headers",
                "--proto", "=https", "--connect-timeout", "8", "--max-time", "15"]
        url = "https://www.census.gov/trade/downloads/2025/Merch/im_m/IMDB2511.ZIP"
        for call, flags in zip(run.call_args_list, (
            ["--head", "--output", "/dev/null", "--header", "accept-encoding: identity"],
            ["--range", f"0-{len(raw)-1}", "--max-filesize", str(len(raw)),
             "--header", "accept-encoding: identity", "--header", 'if-match: "test-private-etag"'],
        )):
            args, = call.args
            self.assertEqual(args, [*base, *flags, "--dump-header", args[-2], url])
            self.assertEqual(call.kwargs, {"capture_output": True, "timeout": 17, "check": True})
        baseline = collector.collect("2025-11", mock_server(raw))
        baseline["archiveETag"] = '"test-private-etag"'
        del answer["retrievedAt"], baseline["retrievedAt"]
        self.assertEqual(answer, baseline)
        self.assertEqual(answer["bytesFetched"], len(raw))

    def test_cli_failure_only_emits_sanitized_diagnostic(self):
        hidden_url = b"https://example.invalid/test-private-url"
        raw_headers = (b"HTTP/2 403 test-private-status\r\nLocation: " + hidden_url
                       + b"\r\nETag: test-private-etag\r\n\r\n")
        for fake, diagnostic in (
            (curl_response(raw_headers, b"test-private-body", returncode=22),
             "stage=head_transport reason=curl_http_error http_status=403"),
            (subprocess.TimeoutExpired(["secret-curl-arguments"], 17, stderr=b"secret-stderr"),
             "stage=head_transport reason=subprocess_timeout"),
            (FileNotFoundError("secret-path"), "stage=head_transport reason=curl_launch_failed"),
            (RuntimeError("secret-unexpected"), "stage=collection reason=unexpected_failure"),
        ):
            with self.subTest(diagnostic=diagnostic), patch.object(
                    subprocess, "run", side_effect=fake) as run, patch.object(
                    sys, "argv", [str(path), "2025-11"]), redirect_stdout(StringIO()) as stdout:
                with self.assertRaises(SystemExit) as exit:
                    runpy.run_path(str(path), run_name="__main__")
                self.assertEqual(exit.exception.code, f"Census import-cost collection failed: {diagnostic}")
                self.assertEqual(stdout.getvalue(), "")
                self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
