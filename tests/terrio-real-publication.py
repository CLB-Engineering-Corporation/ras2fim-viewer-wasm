"""Compare every decoded tile for selected real profiles, using exact library extrema.
Run in lwi-gdal; optional argument 'all' compares the full local pilot library.
"""

import io
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from osgeo import gdal
from PIL import Image
from pmtiles.reader import Reader, all_tiles

from pipeline.fim1d.depth_pmtiles import build_profile

gdal.UseExceptions()
root = Path(".terrio-validation/real-1d")
paths = sorted((root / "cogs").rglob("depth_*.tif"))
assert paths
maximum = 0
for path in paths:
    ds = gdal.Open(str(path))
    maximum = max(maximum, ds.GetRasterBand(1).ComputeRasterMinMax(False)[1])
chosen = paths if "all" in sys.argv[1:] else [paths[0], paths[len(paths) // 2], paths[-1]]
output = Path(".terrio-validation/real-tile-comparison")
cli = str(Path(".terrio-validation/bin/pmtiles.exe").resolve())


def read(path):
    payload = path.read_bytes()

    def source(offset, length):
        return payload[offset : offset + length]

    return Reader(source).header(), {
        tuple(k): np.asarray(Image.open(io.BytesIO(v)).convert("RGBA"))
        for k, v in all_tiles(source)
    }


reports = []
for path in chosen:
    try:
        timings = {}
        for backend in [] if "--compare-only" in sys.argv else ["gdal", "terrio"]:
            started = time.perf_counter()
            build_profile(
                path,
                output / backend / path.with_suffix(".pmtiles").name,
                maximum,
                backend=backend,
                cli=cli,
            )
            timings[backend] = time.perf_counter() - started
        ah, a = read(output / "gdal" / path.with_suffix(".pmtiles").name)
        bh, b = read(output / "terrio" / path.with_suffix(".pmtiles").name)
        shared = a.keys() & b.keys()
        reports.append(
            {
                "profile": path.name,
                "baseline_tiles": len(a),
                "candidate_tiles": len(b),
                "coverage_equal": a.keys() == b.keys(),
                "pixel_mismatch_tiles": [k for k in shared if not np.array_equal(a[k], b[k])],
                "alpha_mismatch_tiles": [
                    k for k in shared if not np.array_equal(a[k][:, :, 3], b[k][:, :, 3])
                ],
                "differing_channels": sum(int(np.count_nonzero(a[k] != b[k])) for k in shared),
                "visible_differing_channels": sum(
                    int(np.count_nonzero((a[k] != b[k]) & (a[k][:, :, 3] > 0)[:, :, None]))
                    for k in shared
                ),
                "max_channel_delta": max(
                    (
                        int(np.max(np.abs(a[k].astype("int16") - b[k].astype("int16"))))
                        for k in shared
                    ),
                    default=0,
                ),
                "bounds_zooms_equal": all(
                    ah[k] == bh[k]
                    for k in [
                        "min_zoom",
                        "max_zoom",
                        "min_lon_e7",
                        "min_lat_e7",
                        "max_lon_e7",
                        "max_lat_e7",
                    ]
                ),
                "seconds": timings,
            }
        )
    except Exception as error:
        reports.append({"profile": path.name, "blocked": str(error)})
print(
    json.dumps(
        {"library_profiles": len(paths), "exact_library_max": maximum, "results": reports}, indent=2
    )
)
