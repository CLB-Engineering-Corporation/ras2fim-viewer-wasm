"""Opt-in GDAL/Terrio archive pixel and supplied-overview COG trial.

Run in lwi-gdal with the locally built CLB terrio package on PYTHONPATH.
Reports mismatches as acceptance blockers; never changes a publication default.
"""

import io
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from osgeo import gdal, osr
from PIL import Image
from pmtiles.reader import Reader, all_tiles

from pipeline.fim1d import cog_postprocess as cp
from pipeline.fim1d import depth_pmtiles as tiles

gdal.UseExceptions()
root = Path(sys.argv[1] if len(sys.argv) > 1 else ".terrio-validation/publication")
root.mkdir(parents=True, exist_ok=True)
cli = os.environ.get("PMTILES_CLI") or str(Path(".terrio-validation/bin/pmtiles.exe").resolve())


def archive(path):
    data = path.read_bytes()

    def source(offset, length):
        return data[offset : offset + length]

    return Reader(source).header(), {
        tuple(key): np.asarray(Image.open(io.BytesIO(payload)).convert("RGBA"))
        for key, payload in all_tiles(source)
    }


def source(path, values, offset=0):
    ds = gdal.GetDriverByName("GTiff").Create(
        str(path), values.shape[1], values.shape[0], 1, gdal.GDT_Float32
    )
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(3857)
    ds.SetProjection(srs.ExportToWkt())
    res = 156543.03392804097 / (2**11)
    ds.SetGeoTransform(
        (
            -20037508.342789244 + (1000 * 256 + offset) * res,
            res,
            0,
            20037508.342789244 - (700 * 256 + offset) * res,
            0,
            -res,
        )
    )
    ds.GetRasterBand(1).SetNoDataValue(-9999)
    ds.GetRasterBand(1).WriteArray(values)
    ds = None


reports = []
for name in ["dry", "one", "edge", "offgrid", "partial-alpha"]:
    values = np.zeros((256, 512), dtype="float32")
    if name == "one":
        values[128, 256] = 5
    elif name != "dry":
        values[50:200, 245:270] = 5
        values[80:100, :5] = 10
    path = root / f"{name}.tif"
    source(path, values, offset=3 if name == "offgrid" else 0)
    try:
        baseline, candidate = root / f"{name}-gdal.pmtiles", root / f"{name}-terrio.pmtiles"
        if name == "partial-alpha":
            rgba = root / "partial-rgba.tif"
            tiles.colourise(path, rgba, 10, "blues")
            ds = gdal.Open(str(rgba), gdal.GA_Update)
            alpha = ds.GetRasterBand(4).ReadAsArray()
            alpha[alpha > 0] = 127
            ds.GetRasterBand(4).WriteArray(alpha)
            ds = None
            mb = root / "partial.mbtiles"
            tiles._to_mbtiles(rgba, mb, name)
            tiles._to_pmtiles(mb, baseline, cli)
            tiles._to_terrio_pmtiles(rgba, candidate, name)
        else:
            tiles.build_profile(path, baseline, 10, cli=cli)
            tiles.build_profile(path, candidate, 10, backend="terrio")
        ah, a = archive(baseline)
        bh, b = archive(candidate)
        shared = a.keys() & b.keys()
        different = [key for key in shared if not np.array_equal(a[key], b[key])]
        alpha_different = [
            key for key in shared if not np.array_equal(a[key][:, :, 3], b[key][:, :, 3])
        ]
        reports.append(
            {
                "case": name,
                "baseline_tiles": len(a),
                "candidate_tiles": len(b),
                "coverage_equal": a.keys() == b.keys(),
                "pixel_different": different,
                "alpha_different": alpha_different,
                "headers": {
                    k: [str(ah[k]), str(bh[k])]
                    for k in [
                        "min_zoom",
                        "max_zoom",
                        "min_lon_e7",
                        "min_lat_e7",
                        "max_lon_e7",
                        "max_lat_e7",
                    ]
                },
            }
        )
    except Exception as error:
        reports.append({"case": name, "blocked": str(error)})

# Preserve a previous destination when the trial writer fails.
good = root / "preserved.pmtiles"
good.write_bytes(b"previous-good-artifact")
try:
    tiles.build_profile(root / "missing.tif", good, 10, backend="terrio")
except Exception:
    assert good.read_bytes() == b"previous-good-artifact"

# The overview algorithm stays in finish_cog; both writers receive its pyramid.
values = np.ones((1024, 1024), dtype="float32") + (np.indices((1024, 1024))[0] % 71) * np.float32(
    0.00137
)
values[:200, :200] = -9999
values[500:550, 500:550] = 7.25
for codec, tolerance in [("DEFLATE", 0), (cp.COMPRESS, cp.MAX_Z_ERROR)]:
    written = []
    for backend in ["gdal", "terrio"]:
        stage = root / f"cog-stage-{codec}-{backend}.tif"
        source(stage, values)
        target = root / f"trial-{codec}-{backend}.tif"
        try:
            cp.finish_cog(
                stage,
                target,
                writer_backend=backend,
                check_bounds=False,
                compress=codec,
                max_z_error=tolerance,
                verbose=False,
            )
            reference, actual = gdal.Open(str(stage)), gdal.Open(str(target))
            errors = []
            for i in range(-1, actual.GetRasterBand(1).GetOverviewCount()):
                a, b = reference.GetRasterBand(1), actual.GetRasterBand(1)
                if i >= 0:
                    a, b = a.GetOverview(i), b.GetOverview(i)
                x, y = a.ReadAsArray(), b.ReadAsArray()
                assert np.array_equal(x == -9999, y == -9999)
                valid = x != -9999
                error = float(np.max(np.abs(x[valid] - y[valid])))
                if codec == "DEFLATE":
                    assert np.array_equal(x, y), "lossless COG values must be exact"
                else:
                    rounding = float(np.spacing(np.float32(np.max(np.abs(x[valid])))))
                    assert error <= tolerance + rounding
                errors.append(error)
            written.append(actual)
            reports.append(
                {
                    "cog_backend": backend,
                    "codec": codec,
                    "validation": "passed",
                    "per_level_source_max_error": errors,
                    "tolerance": tolerance,
                }
            )
        except Exception as error:
            reports.append({"cog_backend": backend, "codec": codec, "blocked": str(error)})
    if len(written) == 2:
        a, b = written
        reports.append(
            {
                "codec": codec,
                "cog_base_equal": np.array_equal(a.ReadAsArray(), b.ReadAsArray()),
                "metadata_equal": a.GetMetadata() == b.GetMetadata(),
                "transform_equal": a.GetGeoTransform() == b.GetGeoTransform(),
                "nodata_equal": a.GetRasterBand(1).GetNoDataValue()
                == b.GetRasterBand(1).GetNoDataValue(),
            }
        )

stage = root / "atomic-stage.tif"
source(stage, values)
prior = root / "atomic-cog.tif"
prior.write_bytes(b"previous-good-cog")
with patch(
    "pipeline.fim1d.terrio_cog.write_existing_overviews",
    side_effect=RuntimeError("injected writer failure"),
):
    try:
        cp.finish_cog(stage, prior, writer_backend="terrio", check_bounds=False, verbose=False)
    except RuntimeError:
        assert prior.read_bytes() == b"previous-good-cog"
        assert not list(root.glob(".atomic-cog.tif.partial-*"))
        reports.append({"cog_failure_atomicity": "passed"})
print(json.dumps(reports, indent=2))

assert not any("blocked" in report for report in reports), "publication acceptance blocked"
tile_reports = [r for r in reports if "case" in r]
assert {r["case"] for r in tile_reports} == {"dry", "one", "edge", "offgrid", "partial-alpha"}
assert all(r["coverage_equal"] and not r["pixel_different"] and not r["alpha_different"]
           and all(pair[0] == pair[1] for pair in r["headers"].values())
           for r in tile_reports), "exact archive acceptance failed"
assert len([r for r in reports if r.get("validation") == "passed"]) == 4
comparisons = [r for r in reports if "cog_base_equal" in r]
assert len(comparisons) == 2
assert all(r["metadata_equal"] and r["transform_equal"] and r["nodata_equal"]
           and (r["codec"] != "DEFLATE" or r["cog_base_equal"]) for r in comparisons)
assert any(r.get("cog_failure_atomicity") == "passed" for r in reports)
