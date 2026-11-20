"""Read one pinned archived netCDF locally. Requires Python 3, GDAL netCDF, NumPy."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from osgeo import gdal

FIXTURE = Path(__file__).resolve().parents[2] / "docs/fixtures/oil-thermal/goes-19-neutral-2025-05-02.audit.json"
SIZE = 5309564
SHA = "92636ad047ec99d8be7cef4a47a5f529d80e62e14ab40cbf6bab81fc4c426ad2"


def verify(path):
    path = path.resolve(strict=True)
    if not path.is_file() or '"' in str(path):
        raise ValueError("expected pinned local archive")
    with path.open("rb") as stream:
        raw = stream.read(SIZE + 1)
    if len(raw) != SIZE or hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError("archive SHA-256 mismatch")
    layers = [gdal.Open(f'NETCDF:"{path}":{v}') for v in ("ACM", "DQF")]
    if any(d is None or (d.RasterXSize, d.RasterYSize) != (2500, 1500) for d in layers):
        raise ValueError("unexpected dimensions")
    a, q = [d.ReadAsArray() for d in layers]
    # Native packed x/y index equals column/row for this pinned object only.
    # GOES-R fixed-grid inverse, independent of GDAL's CRS/affine transform.
    md = layers[0].GetMetadata()
    def num(k):
        return float(md[k])
    x = np.arange(2500)*num("x#scale_factor") + num("x#add_offset")
    y = np.arange(1500)[:, None]*num("y#scale_factor") + num("y#add_offset")
    def proj(k):
        return num("goes_imager_projection#" + k)
    re, rp = proj("semi_major_axis"), proj("semi_minor_axis")
    H = proj("perspective_point_height") + re
    cx, sx = np.cos(x), np.sin(x)
    cy, sy = np.cos(y), np.sin(y)
    ratio = (re/rp)**2
    coeff = sx*sx + cx*cx*(cy*cy + ratio*sy*sy)
    b = -2*H*cx*cy
    with np.errstate(invalid="ignore"):
        r = (-b - np.sqrt(b*b - 4*coeff*(H*H-re*re))) / (2*coeff)
    s1, s2, s3 = r*cx*cy, -r*sx, r*cx*sy
    lon = proj("longitude_of_projection_origin") - np.degrees(np.arctan2(s2, H-s1))
    lat = np.degrees(np.arctan2(ratio*s3, np.hypot(H-s1, s2)))
    box = (lon >= -95) & (lon <= -90) & (lat >= 40) & (lat <= 45)
    good = box & (q == 0) & (a >= 0) & (a <= 3)
    return dict(archive_sha256=SHA, box_pixel_centres=int(box.sum()),
                dqf_good_and_valid_acm=int(good.sum()),
                acm_counts_dqf_good=[int((good & (a == i)).sum()) for i in range(4)],
                viirs_collocation="not_evaluated")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    result = verify(parser.parse_args().archive)
    if result != json.loads(FIXTURE.read_text(encoding="utf-8")):
        parser.exit(1, "Historical GOES aggregate did not match the expected replay\n")
    print(json.dumps(result, indent=2))
