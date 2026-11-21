#!/usr/bin/env python3
"""Fetch only the Census national commodity member; emit a non-scoring monthly summary."""
from datetime import date, datetime, timezone
import hashlib
import io
from email.parser import BytesHeaderParser
from pathlib import Path
import json
import re
import subprocess
import tempfile
import sys
from urllib.request import Request
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED

from census_import_cost import summarize

BASE = "https://www.census.gov/trade/downloads"
MAX_ZIP = 700_000_000
MAX_BYTES = 9_000_000
MAX_MEMBER_BYTES = 24_000_000
MAX_REQUESTS = 12


class CollectionFailure(ValueError):
    """A CLI-safe diagnostic: literal stage/reason labels and an optional HTTP code."""
    def __init__(self, stage, reason, *, status=None):
        diagnostic = f"stage={stage} reason={reason}"
        if type(status) is int and 100 <= status <= 599:
            diagnostic += f" http_status={status}"
        super().__init__(diagnostic)


def response_head(path, stage):
    try:
        raw = path.read_bytes()
    except OSError:
        raise CollectionFailure(stage, "header_file_unavailable") from None
    blocks = [part for part in raw.split(b"\r\n\r\n") if part.startswith(b"HTTP/")]
    if not blocks:
        raise CollectionFailure(stage, "http_status_line_missing")
    first, _, headers = blocks[-1].partition(b"\r\n")
    fields = first.split()
    try:
        status = int(fields[1])
    except (IndexError, ValueError):
        raise CollectionFailure(stage, "http_status_line_invalid") from None
    if not 100 <= status <= 599:
        raise CollectionFailure(stage, "http_status_line_invalid")
    return status, headers


def header_values(headers, name):
    if hasattr(headers, "get_all"):
        return headers.get_all(name, [])
    value = headers.get(name)
    return [] if value is None else [value]


def decimal(value):
    """Parse an HTTP decimal without accepting signs, Unicode or unbounded integers."""
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value := value.strip(" \t")):
        return None
    digits = value.lstrip("0")
    return MAX_ZIP + 1 if len(digits) > len(str(MAX_ZIP)) else int(digits or "0")


def strong_etag(value):
    return isinstance(value, str) and bool(re.fullmatch(r'"[!#-~]*"', value))


def require_probe_size_limit():
    # Older curl only honors --max-filesize when the size is known in advance.
    # This probe is specifically for an endpoint that may omit Content-Length.
    try:
        info = subprocess.run(["curl", "-q", "--version"], capture_output=True,
                              timeout=2, check=True)
    except (subprocess.SubprocessError, OSError):
        raise CollectionFailure("metadata_probe_transport", "curl_size_limit_unverified") from None
    line = info.stdout.split(b"\n", 1)[0]
    versions = (re.match(rb"curl ([0-9]{1,4})\.([0-9]{1,4})\.([0-9]{1,4})(?: |$)", line),
                re.search(rb" libcurl/([0-9]{1,4})\.([0-9]{1,4})\.([0-9]{1,4})(?: |$)", line))
    if not all(match and tuple(map(int, match.groups())) >= (8, 4, 0) for match in versions):
        raise CollectionFailure("metadata_probe_transport", "curl_size_limit_unverified")


def request_census(request, timeout, *, metadata_probe=False):
    # Ordinary HTTPS to the official public bulk endpoint, no redirects or cookies.
    stage = "head_transport" if request.method == "HEAD" else "range_transport"
    if metadata_probe:
        stage = "metadata_probe_transport"
        require_probe_size_limit()
    headers = {key.lower(): value for key, value in request.header_items()}
    args = ["curl", "-q", "--silent", "--show-error", "--fail", "--suppress-connect-headers",
            "--proto", "=https", "--connect-timeout", "8", "--max-time", str(timeout)]
    if request.method == "HEAD":
        args += ["--head", "--output", "/dev/null"]
    else:
        start, end = map(int, headers.pop("range").removeprefix("bytes=").split("-"))
        args += ["--range", f"{start}-{end}", "--max-filesize", str(end - start + 1)]
    for name, value in headers.items():
        args += ["--header", f"{name}: {value}"]
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "headers"
        try:
            result = subprocess.run([*args, "--dump-header", str(path), request.full_url],
                                    capture_output=True, timeout=timeout + 2, check=True)
        except subprocess.TimeoutExpired:
            raise CollectionFailure(stage, "subprocess_timeout") from None
        except subprocess.CalledProcessError as error:
            try:
                status, _ = response_head(path, stage)
            except CollectionFailure:
                status = None
            reason = {22: "curl_http_error", 28: "curl_timeout",
                      63: "curl_size_limit"}.get(error.returncode, "curl_failed")
            raise CollectionFailure(stage, reason, status=status) from None
        except OSError:
            raise CollectionFailure(stage, "curl_launch_failed") from None
        status, header_bytes = response_head(path, stage)
    response = io.BytesIO(result.stdout)
    response.status = status
    response.headers = BytesHeaderParser().parsebytes(header_bytes)
    return response


class RangeZip:
    def __init__(self, url, request=None):
        self.url = url
        self.request = request or request_census
        self.count = self.received = self.pos = 0
        self.cache_start, self.cache = 0, b""
        self.last_modified = set()
        with self.open("HEAD", {"Accept-Encoding": "identity"}) as response:
            status = response.status
            if status != 200:
                raise CollectionFailure("head_metadata", "unexpected_status", status=status)
            lengths = header_values(response.headers, "Content-Length")
            self.probed_length = not lengths
            # A strong ETag binds every range. Some Census cache replicas expose
            # different Last-Modified clocks for the same file, so without an
            # ETag the ZIP member's directory identity and CRC remain authoritative.
            etag = response.headers.get("ETag", "")
            self.etag = etag if isinstance(etag, str) and etag.startswith('"') else None
            if lengths:
                if len(lengths) != 1 or (length := decimal(lengths[0])) is None:
                    raise CollectionFailure("head_metadata", "content_length_invalid", status=status)
                if not 1 <= length <= MAX_ZIP:
                    raise CollectionFailure("head_metadata", "content_length_out_of_bounds", status=status)
                self.length = length
                return
            if getattr(response.headers, "defects", ()):
                raise CollectionFailure("head_metadata", "headers_invalid", status=status)
            tags = header_values(response.headers, "ETag")
            if len(tags) > 1 or (self.etag and not strong_etag(self.etag)):
                raise CollectionFailure("head_metadata", "etag_invalid", status=status)
        self.length = self.probe_length()

    def probe_length(self):
        stage = "metadata_probe_envelope"
        if self.received + 1 > MAX_BYTES:
            raise CollectionFailure("budget", "transfer_byte_limit")
        headers = {"Range": "bytes=0-0", "Accept-Encoding": "identity"}
        if self.etag:
            headers["If-Match"] = self.etag
        with self.open("GET", headers, metadata_probe=True) as response:
            status = response.status
            if status != 206:
                raise CollectionFailure(stage, "unexpected_status", status=status)
            if getattr(response.headers, "defects", ()):
                raise CollectionFailure(stage, "headers_invalid", status=status)
            ranges = header_values(response.headers, "Content-Range")
            match = (re.fullmatch(r"bytes 0-0/([1-9][0-9]*)", ranges[0])
                     if len(ranges) == 1 and isinstance(ranges[0], str) else None)
            if not match:
                raise CollectionFailure(stage, "content_range_invalid", status=status)
            total = decimal(match[1])
            if total > MAX_ZIP:
                raise CollectionFailure(stage, "archive_length_out_of_bounds", status=status)
            lengths = header_values(response.headers, "Content-Length")
            if lengths and (len(lengths) != 1 or decimal(lengths[0]) != 1):
                raise CollectionFailure(stage, "content_length_invalid", status=status)
            encodings = header_values(response.headers, "Content-Encoding")
            if encodings not in ([], ["identity"]):
                raise CollectionFailure(stage, "content_encoding_mismatch", status=status)
            tags = header_values(response.headers, "ETag")
            if len(tags) > 1 or (self.etag and tags != [self.etag]):
                raise CollectionFailure(stage, "etag_mismatch", status=status)
            if len(response.read(2)) != 1:
                raise CollectionFailure(stage, "body_length_mismatch", status=status)
            if not self.etag and tags and strong_etag(tags[0]):
                self.etag = tags[0]
        self.received += 1
        return total

    def open(self, method, headers, *, metadata_probe=False):
        self.count += 1
        if self.count > MAX_REQUESTS:
            raise CollectionFailure("budget", "request_limit")
        request = Request(self.url, headers=headers, method=method)
        if metadata_probe and self.request is request_census:
            return self.request(request, timeout=15, metadata_probe=True)
        return self.request(request, timeout=15)

    def seek(self, offset, whence=io.SEEK_SET):
        start = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.length}[whence]
        position = start + offset
        if position < 0:
            raise OSError("negative seek")
        self.pos = position
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def read(self, size=-1):
        left = max(self.length - self.pos, 0)
        length = left if size < 0 else min(left, size)
        if length == 0:
            return b""
        start = self.pos
        end = start + length
        if self.cache_start <= start and end <= self.cache_start + len(self.cache):
            self.pos = end
            return self.cache[start - self.cache_start:end - self.cache_start]
        # ZipFile makes several small seeks into its tail and local header.
        # Keep one small range in memory so those seeks do not repeat requests.
        if length < 65_536:
            offset = min(start, max(self.length - 65_536, 0))
            count = min(self.length - offset, 65_536)
        else:
            offset, count = start, length
        if self.received + count > MAX_BYTES:
            raise CollectionFailure("budget", "transfer_byte_limit")
        last = offset + count - 1
        headers = {"Range": f"bytes={offset}-{last}", "Accept-Encoding": "identity"}
        if self.etag:
            headers["If-Match"] = self.etag
        with self.open("GET", headers) as response:
            expected = f"bytes {offset}-{last}/{self.length}"
            status = response.status
            if status != 206:
                raise CollectionFailure("range_envelope", "unexpected_status", status=status)
            if response.headers.get("Content-Range") != expected:
                raise CollectionFailure("range_envelope", "content_range_mismatch", status=status)
            if self.etag and (response.headers.get("ETag") != self.etag or (
                    self.probed_length and header_values(response.headers, "ETag") != [self.etag])):
                raise CollectionFailure("range_envelope", "etag_mismatch", status=status)
            if response.headers.get("Content-Encoding", "identity") != "identity":
                raise CollectionFailure("range_envelope", "content_encoding_mismatch", status=status)
            if value := response.headers.get("Last-Modified"):
                self.last_modified.add(value)
            data = response.read(count + 1)
        if len(data) != count:
            raise CollectionFailure("range_envelope", "body_length_mismatch", status=status)
        self.received += count
        self.pos = end
        if count <= 65_536:
            self.cache_start, self.cache = offset, data
        return data[start - offset:end - offset]


def collect(period, request=None):
    if not re.fullmatch(r"20[0-9]{2}-(0[1-9]|1[0-2])", period):
        raise CollectionFailure("input", "month_invalid")
    year, month = period.split("-")
    if date(int(year), int(month), 1) >= datetime.now(timezone.utc).date().replace(day=1):
        raise CollectionFailure("input", "month_not_closed")
    url = f"{BASE}/{year}/Merch/im_m/IMDB{year[-2:]}{month}.ZIP"
    remote = RangeZip(url, request)
    def commodity(archive):
        candidates = [info for info in archive.infolist() if info.filename.lower() == "imp_comm.txt"]
        if len(candidates) != 1:
            raise CollectionFailure("archive", "commodity_member_count")
        return candidates[0]
    try:
        with ZipFile(remote) as archive:
            member = commodity(archive)
            if not 0 < member.file_size <= MAX_MEMBER_BYTES or member.compress_type != ZIP_DEFLATED:
                raise CollectionFailure("archive", "commodity_member_out_of_bounds")
            # ZipFile checks CRC on the complete member; no raw file is written.
            raw = archive.read(member)
        if not remote.etag:
            # Bypass only the local in-memory cache for an independent directory read.
            remote.cache = b""
            with ZipFile(remote) as archive:
                again = commodity(archive)
                attrs = ("filename", "CRC", "compress_type", "file_size", "compress_size", "header_offset")
                if any(getattr(member, key) != getattr(again, key) for key in attrs):
                    raise CollectionFailure("archive", "commodity_member_identity_changed")
    except BadZipFile:
        raise CollectionFailure("archive", "zip_integrity_failure") from None
    result = summarize(io.BytesIO(raw), period)
    return {"source": url, "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "archiveETag": remote.etag, "rangeLastModified": sorted(remote.last_modified),
            "memberSha256": hashlib.sha256(raw).hexdigest(), "bytesFetched": remote.received,
            "requestCount": remote.count, "eligibleForMainScore": False,
            "eligibleForPricePrediction": False, "result": result}


def main(argv):
    if len(argv) != 1:
        sys.exit("Usage: python3 tools/oil-directional/fetch-census-import-cost.py YYYY-MM")
    try:
        print(json.dumps(collect(argv[0]), allow_nan=False, indent=2))
    except CollectionFailure as error:
        sys.exit(f"Census import-cost collection failed: {error}")
    except Exception:
        # No exception details or traceback on the public Actions failure path.
        sys.exit("Census import-cost collection failed: stage=collection reason=unexpected_failure")


if __name__ == "__main__":
    main(sys.argv[1:])
