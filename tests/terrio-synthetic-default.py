"""Omitted-backend default dispatch on a synthetic State Plane depth grid.

The CI-runnable counterpart of ``terrio-default-publication.py``: the same
assertions, on a generated EPSG:2277 (Texas Central, US ft) source instead of
the private pilot corpus, so it runs on any platform with a reviewed native
wheel, GDAL >= 3.8, Pillow, pmtiles and the go-pmtiles CLI (``PMTILES_CLI``).

* COGs: ``cogs.build_model`` with the backend omitted must select Terrio. The
  staged base/overview arrays handed to each writer must be identical between
  backends; each writer's decoded output must meet the unchanged codec bound
  against those exact arrays (``check_codec_bound``); nodata masks are
  separate and exact. Pairwise lossy differences are reported, never gated.
* PMTiles: ``build_profile`` with the backend omitted must select Terrio and
  match the GDAL/go-pmtiles archive exactly in coverage, alpha, zoom range and
  bounds. RGB is compared exactly and every difference is REPORTED (tiles,
  pixels, per-channel maximum) -- not gated and not toleranced. On this smooth
  gradient the pinned runtime already differs from GDAL by one 8-bit level in
  some bilinear/average-resampled pixels on Windows, with the reviewed wheel;
  the accepted exact gates are ``terrio-publication.py`` (synthetic) and the
  72-archive real-pilot corpus, which this does not replace.
* Cross-platform identity: the source is built only from correctly rounded
  IEEE operations (no libm transcendental), so its bytes are the same on every
  OS. Per-tile RGBA digests for both backends are recorded so a platform's
  output can be compared with the reviewed Windows wheel's byte for byte.

Usage: python tests/terrio-synthetic-default.py OUTPUT_DIRECTORY
"""

import hashlib
import io
import json
import os
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace as S
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from osgeo import gdal, osr
from PIL import Image
from pmtiles.reader import Reader, all_tiles

from pipeline.common.terrio_runtime import require_terrio
from pipeline.fim1d import cogs
from pipeline.fim1d import depth_pmtiles as tiles
from tests.codec_bounds import check_codec_bound

gdal.UseExceptions()
root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)
cli = os.environ["PMTILES_CLI"]
terrio = require_terrio()  # The guard itself, on this platform's reviewed artifact.


def synthetic_source(path, peak):
    """A RASMapper-like depth grid: wet channel and floodplain, dry 0.0 cells, nodata."""
    ny, nx, cell = 600, 900, 10.0
    y, x = np.mgrid[0:ny, 0:nx].astype("float64")

    def triangle(t):  # period 4, range [-1, 1]; only exactly specified IEEE operations
        return np.abs(np.fmod(t, 4.0) - 2.0) - 1.0

    channel = 300 + 60 * triangle(x / 140.0)
    distance = np.abs(y - channel)
    c = np.clip(1 - distance / 180.0, 0, None)
    depth = peak * c * np.sqrt(c)
    depth += 0.37 * triangle(x / 7.0) * triangle(y / 11.0) * (depth > 0)
    values = np.where(depth > 0.02, depth, 0.0).astype("float32")  # exact 0.0: not inundation
    values[:40, :] = -9999  # outside the model extent
    values[:, -25:] = -9999
    ds = gdal.GetDriverByName("GTiff").Create(str(path), nx, ny, 1, gdal.GDT_Float32,
                                              options=["TILED=YES", "COMPRESS=DEFLATE"])
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(2277)
    ds.SetProjection(srs.ExportToWkt())
    ds.SetGeoTransform((3_088_000.0, cell, 0, 10_075_000.0, 0, -cell))
    band = ds.GetRasterBand(1)
    band.SetNoDataValue(-9999)
    band.WriteArray(values)
    ds = None
    return float(values[values > 0].max()), hashlib.sha256(values.tobytes()).hexdigest()


def archive(path):
    body = path.read_bytes()

    def read(offset, length):
        return body[offset:offset + length]

    return Reader(read).header(), {
        tuple(k): np.asarray(Image.open(io.BytesIO(v)).convert("RGBA")) for k, v in all_tiles(read)
    }


sources = root / "source"
sources.mkdir()
generated = [synthetic_source(sources / "depth_000.tif", 12.5), synthetic_source(sources / "depth_001.tif", 31.8)]
peaks = [p for p, _ in generated]
unit = S(unit_name="synthetic", huc8="00000000", model_unit="ft", crs="EPSG:2277")
model = S(slug="synthetic", model_id="synthetic", name="synthetic",
          profiles=[S(index=i, label=f"{i:03d}", depth_tif=sources / f"depth_{i:03d}.tif") for i in range(2)])

original = cogs.cp.finish_cog
staged = []


def capture(stage, target, **kw):
    report = original(stage, target, **kw)
    copy = root / f"supplied-{len(staged)}.tif"
    shutil.copyfile(stage, copy)
    staged.append(copy)
    return report


with patch.object(cogs.cp, "finish_cog", side_effect=capture):
    reports = {"gdal": cogs.build_model(unit, model, root / "gdal", writer_backend="gdal", verbose=False),
               "default": cogs.build_model(unit, model, root / "default", verbose=False)}
assert all(p["writer"]["backend"] == "terrio" for p in reports["default"]["profiles"]), reports["default"]
assert len(staged) == 4


def levels(path):
    ds = gdal.Open(str(path))
    band = ds.GetRasterBand(1)
    arrays = [band.ReadAsArray()] + [band.GetOverview(i).ReadAsArray() for i in range(band.GetOverviewCount())]
    return (ds.GetGeoTransform(), ds.GetProjection(), ds.GetMetadata(), band.GetNoDataValue()), arrays


digest = lambda a: hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
result = {"terrio": terrio.__file__, "platform": sys.platform, "gdal": gdal.VersionInfo(),
          "source_values_sha256": [h for _, h in generated], "profiles": []}
for i, profile in enumerate(model.profiles):
    name = f"synthetic/synthetic/depth_{profile.index:03d}.tif"
    (gdal_meta, gdal_levels), (default_meta, default_levels) = levels(root / "gdal" / name), levels(root / "default" / name)
    assert gdal_meta == default_meta, "georeferencing/metadata/nodata differ between writers"
    assert len(gdal_levels) == len(default_levels) > 1
    _, supplied_gdal = levels(staged[i])
    _, supplied_default = levels(staged[len(model.profiles) + i])
    assert len(supplied_gdal) == len(supplied_default)
    assert all(np.array_equal(a, b) for a, b in zip(supplied_gdal, supplied_default)), "supplied arrays differ"
    bounds = {"gdal": [], "terrio": []}
    for label, decoded in (("gdal", gdal_levels), ("terrio", default_levels)):
        for exact, out in zip(supplied_gdal, decoded):
            error, tolerance = check_codec_bound(exact, out)
            bounds[label].append({"error": error, "tolerance": tolerance})
    pairwise = []
    for a, b in zip(gdal_levels, default_levels):
        assert a.shape == b.shape and np.array_equal(a == -9999, b == -9999)
        valid = a != -9999
        pairwise.append(float(np.max(np.abs(a[valid] - b[valid]))) if valid.any() else 0.0)

    cog = root / "default" / name
    depth_max = max(peaks)
    reference = tiles.build_profile(cog, root / f"gdal-{i}.pmtiles", depth_max, backend="gdal", cli=cli)
    candidate = tiles.build_profile(cog, root / f"default-{i}.pmtiles", depth_max)
    assert candidate["provenance"]["backend"] == "terrio", candidate["provenance"]
    ah, a = archive(reference["pmtiles"])
    bh, b = archive(candidate["pmtiles"])
    assert a.keys() == b.keys(), "tile coverage differs"
    for k in ["min_zoom", "max_zoom", "min_lon_e7", "min_lat_e7", "max_lon_e7", "max_lat_e7"]:
        assert ah[k] == bh[k], k
    assert all(np.array_equal(a[k][..., 3], b[k][..., 3]) for k in a), "alpha differs"
    rgb = []
    for k in sorted(a):
        delta = np.abs(a[k][..., :3].astype(int) - b[k][..., :3].astype(int))
        if delta.any():
            rgb.append({"tile": list(k), "pixels": int((delta.max(axis=2) > 0).sum()),
                        "max_per_channel": delta.reshape(-1, 3).max(0).tolist()})
    result["profiles"].append({
        "profile": profile.index, "cog_writer": reports["default"]["profiles"][i]["writer"],
        "supplied_arrays_between_backends": "exact", "levels": len(supplied_gdal),
        "each_writer_vs_exact_supplied_arrays": bounds, "lossy_writer_pair_errors": pairwise,
        "tiles": len(a), "coverage_alpha_zooms_bounds": "exact",
        "rgb_exact": not rgb, "rgb_differences": rgb,
        "rgb_different_pixels": sum(r["pixels"] for r in rgb),
        "rgb_max_channel_difference": max((max(r["max_per_channel"]) for r in rgb), default=0),
        "supplied_level_sha256": [digest(x) for x in supplied_default],
        "terrio_tile_rgba_sha256": {"/".join(map(str, k)): digest(b[k]) for k in sorted(b)},
        "gdal_tile_rgba_sha256": {"/".join(map(str, k)): digest(a[k]) for k in sorted(a)},
        "zooms": [ah["min_zoom"], ah["max_zoom"]], "pmtiles_backend": candidate["provenance"]})
(root / "report.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
print(json.dumps(result, indent=2, default=str))
