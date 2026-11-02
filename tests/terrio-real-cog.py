"""A real WGS84 pilot COG, supplied-overview and bounds/codec validation trial."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from osgeo import gdal

from pipeline.fim1d.cog_postprocess import finish_cog

gdal.UseExceptions()
source = sorted(Path(".terrio-validation/real-1d/cogs").rglob("depth_*.tif"))[-1]
root = Path(".terrio-validation/real-cog")
root.mkdir(exist_ok=True)
results = []
for backend in ["gdal", "terrio"]:
    stage, out = root / f"stage-{backend}.tif", root / f"published-{backend}.tif"
    written = gdal.Translate(
        str(stage), str(source), format="GTiff", creationOptions=["TILED=YES", "COMPRESS=DEFLATE"]
    )
    written = None
    report = finish_cog(stage, out, writer_backend=backend, verbose=False)
    baseline, actual = gdal.Open(str(stage)), gdal.Open(str(out))
    a, b = baseline.GetRasterBand(1), actual.GetRasterBand(1)
    assert baseline.GetGeoTransform() == actual.GetGeoTransform()
    assert baseline.GetProjection() == actual.GetProjection()
    assert baseline.GetMetadata() == actual.GetMetadata()
    assert a.GetNoDataValue() == b.GetNoDataValue()
    assert a.GetOverviewCount() == b.GetOverviewCount()
    errors = []
    tolerances = []
    for i in range(-1, a.GetOverviewCount()):
        x = a.ReadAsArray() if i < 0 else a.GetOverview(i).ReadAsArray()
        y = b.ReadAsArray() if i < 0 else b.GetOverview(i).ReadAsArray()
        valid = x != a.GetNoDataValue()
        assert np.array_equal(valid, y != b.GetNoDataValue())
        error = float(np.max(np.abs(x[valid] - y[valid]))) if valid.any() else 0
        magnitude = (
            max(float(np.max(np.abs(x[valid]))), float(np.max(np.abs(y[valid]))))
            if valid.any()
            else 0
        )
        tolerance = 0.01 + abs(float(np.spacing(np.float32(magnitude))))
        assert error <= tolerance
        tolerances.append(tolerance)
        errors.append(error)
    overview_report = report["overviews"]
    for level in overview_report["levels"]:
        level.pop("seconds", None)
    results.append(
        {
            "backend": backend,
            "source": str(source),
            "validation": report["validation"],
            "overview_report": overview_report,
            "per_level_max_error": errors,
            "per_level_tolerance_including_one_float32_ulp": tolerances,
        }
    )
assert results[0]["overview_report"] == results[1]["overview_report"]
print(json.dumps(results, indent=2))
