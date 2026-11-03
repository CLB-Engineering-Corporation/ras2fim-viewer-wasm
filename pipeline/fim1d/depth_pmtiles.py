"""Bake each profile's depth COG into a static raster PMTiles archive.

Why this exists
---------------

The 1D dashboard draws depth as a raster tile layer, and until now the only way
to serve those tiles was TiTiler reading the COGs. That is the right answer for
a private deployment carrying many units: one tile service, no pre-rendering,
any colour ramp on demand.

It is the wrong answer for a public demo. GitHub Pages cannot run TiTiler, and
the whole point of this repository is that a browser can read flood-inundation
results with no raster machinery behind them. The 2D viewer already proves that
for NetCDF; this is the 1D equivalent, and it is cheap: the pilot library is
72 profiles and **8 MB** of tiles, because a flood is a thin corridor inside a
much larger model bounding box and every fully transparent tile is skipped.

Measured on the pilot unit, profile 60: the wet area is 3.2 x 2.9 km inside a
15 x 35 km grid -- 0.9% of the cells -- which is 6 tiles at zoom 14 and 13 in
the whole pyramid.

What it does NOT do
-------------------

It does not replace the TiTiler path, and the viewer still supports both: the
manifest names a ``depth_pmtiles`` per profile when one was built, and the page
falls back to ``rasterTileBase`` when it was not. A deployment with fifty units
should keep tiling on demand.

Lineage
-------

Tiles are built from the **built COGs**, not from the source depth grids, so the
two delivery paths render the same numbers by construction. The rescale is the
library maximum over every profile, never the profile's own -- see
``pipeline/common/ramp.py`` for why.

Usage::

    python -m pipeline.fim1d.depth_pmtiles src/viewer-1d --out src/viewer-1d \\
        --depth-max 31.836
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from osgeo import gdal

from ..common.empty_tiles import EMPTY_REPRESENTATION, TRANSPARENT_PNG
from ..common.ramp import DEFAULT as DEFAULT_RAMP
from ..common.ramp import table as ramp_table

gdal.UseExceptions()

#: Written into the archive so a reader can tell tiles apart from vector ones.
TILE_FORMAT = "PNG"

#: GDAL picks the base zoom from the raster's own resolution; these are the
#: overview factors that fill in the zooms below it. Five levels takes the pilot
#: unit from zoom 14 down to 9, which is wider than its own bounding box.
OVERVIEW_FACTORS = (2, 4, 8, 16, 32)


class DepthTileError(RuntimeError):
    """A profile could not be tiled."""


def _to_terrio_pmtiles(rgba: Path, destination: Path, name: str) -> dict:
    """Trial the generic lazy tile writer; preserve the RGBA input and ramp."""
    from ..common.terrio_runtime import require_terrio
    terrio = require_terrio()
    source = gdal.Open(str(rgba))
    projected = gdal.AutoCreateWarpedVRT(source, None, "EPSG:3857", gdal.GRA_Bilinear)
    resolution = abs(projected.GetGeoTransform()[1])
    maximum = max(0, min(30, int(math.floor(math.log2(156543.03392804097 / resolution) + 0.5))))
    base_resolution = 156543.03392804097 / (2 ** maximum)
    width = projected.RasterXSize * resolution / base_resolution
    height = projected.RasterYSize * abs(projected.GetGeoTransform()[5]) / base_resolution
    minimum = _minimum_tile_zoom(width, height, maximum)
    options = {"TILE_FORMAT": "PNG", "MINZOOM": str(minimum), "MAXZOOM": str(maximum),
               "ZOOM_LEVEL_STRATEGY": "AUTO", "RESAMPLING": "BILINEAR",
               "OVERVIEW_RESAMPLING": "AVERAGE", "NAME": name}
    terrio.open_raster(str(rgba), lazy=True).write(
        str(destination), driver="PMTiles", options=options)
    return {"backend": "terrio", "version": getattr(terrio, "__version__", "unknown"),
            "options": options, "source_commit": "9c644f4a1729e253f9714813912f54d32e306c38"}


def _minimum_tile_zoom(width: float, height: float, maximum: int) -> int:
    """Match reopened GDAL MBTiles' available overview levels, capped by our factors.

    GDAL 3.13 MBTiles Open/InitRaster includes the first level whose rounded
    width and height are both below 256, then silently ignores deeper requests.
    See OSGeo/gdal v3.13.0 frmts/mbtiles/mbtilesdataset.cpp.
    """
    minimum = maximum
    for step in range(1, min(maximum, len(OVERVIEW_FACTORS)) + 1):
        minimum = maximum - step
        if (math.floor(0.5 + width / (2 ** step)) < 256 and
                math.floor(0.5 + height / (2 ** step)) < 256):
            break
    return minimum


def _require_pmtiles_cli() -> str:
    """The `pmtiles` CLI converts MBTiles to PMTiles; fail early if it is absent."""
    exe = shutil.which("pmtiles")
    if not exe:
        raise DepthTileError(
            "the `pmtiles` CLI is not on PATH. It converts the MBTiles GDAL writes "
            "into the single-file archive the browser reads. "
            "Install from https://github.com/protomaps/go-pmtiles/releases"
        )
    return exe


def colourise(cog: Path, rgba_path: Path, depth_max_ft: float, colormap: str) -> int:
    """Write an RGBA byte GeoTIFF of one depth grid. Returns the opaque cell count.

    The alpha channel carries the wet mask, and it is what makes the archive
    small: a fully transparent tile is not stored at all.
    """
    if not math.isfinite(depth_max_ft) or depth_max_ft < 0:
        raise DepthTileError(f"depth_max_ft must be finite and nonnegative, got {depth_max_ft}")

    source = gdal.Open(str(cog))
    if source is None:
        raise DepthTileError(f"cannot open {cog}")
    band = source.GetRasterBand(1)
    nodata = band.GetNoDataValue()
    data = band.ReadAsArray().astype("float32")

    wet = np.isfinite(data)
    if nodata is not None:
        wet &= data != nodata
    # A wet cell of exactly 0.0 ft is not inundation. See common/ramp.py.
    wet &= data > 0

    # Rescale against the LIBRARY maximum, so the ramp shows the flood rising.
    if wet.any() and depth_max_ft == 0:
        raise DepthTileError("positive depth cells require a positive library maximum")
    index = ((np.clip(data / depth_max_ft, 0.0, 1.0) * 255).astype(np.uint8)
             if depth_max_ft > 0 else np.zeros(data.shape, dtype=np.uint8))
    table = ramp_table(colormap)

    driver = gdal.GetDriverByName("GTiff")
    out = driver.Create(str(rgba_path), source.RasterXSize, source.RasterYSize, 4,
                        gdal.GDT_Byte, options=["COMPRESS=DEFLATE", "TILED=YES"])
    out.SetGeoTransform(source.GetGeoTransform())
    out.SetProjection(source.GetProjection())
    coloured = table[index]
    for channel in range(3):
        out.GetRasterBand(channel + 1).WriteArray(coloured[:, :, channel])
    out.GetRasterBand(4).WriteArray(np.where(wet, 255, 0).astype(np.uint8))
    out.FlushCache()
    out = None
    source = None
    return int(wet.sum())


def _write_empty_archive(rgba: Path, destination: Path, name: str) -> None:
    """Represent an all-dry raster with one transparent z0 sentinel.

    Zero-entry archives are rejected by the independent Go PMTiles verifier.
    A transparent sentinel has no painted footprint and works with ordinary
    readers and overzooming, without a manifest fallback to a tile service.
    """
    from osgeo import osr
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    ds = gdal.Open(str(rgba))
    if ds is None or not ds.GetProjection():
        raise DepthTileError("empty archive requires a readable georeferenced source")
    source = osr.SpatialReference(wkt=ds.GetProjection())
    target = osr.SpatialReference()
    target.ImportFromEPSG(4326)
    for srs in (source, target):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    corners = [gdal.ApplyGeoTransform(ds.GetGeoTransform(), x, y)
               for x, y in ((0, 0), (ds.RasterXSize, 0),
                            (0, ds.RasterYSize), (ds.RasterXSize, ds.RasterYSize))]
    xs, ys = zip(*corners, strict=True)
    bounds = osr.CoordinateTransformation(source, target).TransformBounds(
        min(xs), min(ys), max(xs), max(ys), 21)
    if (not all(math.isfinite(v) for v in bounds) or
            not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90)):
        raise DepthTileError(f"empty archive has invalid WGS84 bounds: {bounds}")
    header = {"tile_compression": Compression.NONE, "tile_type": TileType.PNG,
              **dict(zip(("min_lon_e7", "min_lat_e7", "max_lon_e7", "max_lat_e7"),
                         (round(v * 1e7) for v in bounds), strict=True))}
    with destination.open("wb") as handle:
        writer = Writer(handle)
        writer.write_tile(zxy_to_tileid(0, 0, 0), TRANSPARENT_PNG)
        writer.finalize(header, {"name": name, "format": "png", "type": "overlay",
                                 "empty": True, "empty_representation": EMPTY_REPRESENTATION})


def _to_mbtiles(rgba_path: Path, mbtiles_path: Path, name: str) -> None:
    if mbtiles_path.exists():
        mbtiles_path.unlink()
    # The dataset gdal.Translate returns MUST be released before the file is
    # reopened: GDAL flushes the tile table on close, and reopening a half
    # written MBTiles gives a pyramid with a handful of tiles and no error.
    written = gdal.Translate(
        str(mbtiles_path), str(rgba_path), format="MBTILES",
        creationOptions=[f"TILE_FORMAT={TILE_FORMAT}", f"NAME={name}",
                         "ZOOM_LEVEL_STRATEGY=AUTO"],
    )
    written = None

    dataset = gdal.Open(str(mbtiles_path), gdal.GA_Update)
    if dataset is None:
        raise DepthTileError(f"MBTiles was not written: {mbtiles_path}")
    dataset.BuildOverviews("AVERAGE", list(OVERVIEW_FACTORS))
    dataset = None


def _to_pmtiles(mbtiles_path: Path, out_path: Path, cli: str) -> None:
    if out_path.exists():
        out_path.unlink()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([cli, "convert", str(mbtiles_path), str(out_path)],
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise DepthTileError(
            f"pmtiles convert failed for {mbtiles_path.name}:\n{result.stderr.strip()[-800:]}")
    if not out_path.is_file():
        raise DepthTileError(f"pmtiles convert reported success but wrote nothing: {out_path}")


def build_profile(cog: Path, out_path: Path, depth_max_ft: float, *,
                  colormap: str = DEFAULT_RAMP, cli: str | None = None,
                  backend: str = "terrio") -> dict:
    """Tile one profile. Returns a record for the manifest."""
    if backend not in ("gdal", "terrio"):
        raise DepthTileError(f"unknown tile backend: {backend}")
    try:
        from pmtiles.reader import Reader
        from pmtiles.tile import TileType
    except ImportError as error:
        raise DepthTileError(
            "install the fim1d Python dependencies (pmtiles>=3.4,<4) before tiling") from error
    out_path.parent.mkdir(parents=True, exist_ok=True)
    partial = out_path.with_name(f".{out_path.stem}.partial-{os.getpid()}.pmtiles")
    with tempfile.TemporaryDirectory(prefix="fim-depth-tiles-") as tmp:
        scratch = Path(tmp)
        rgba = scratch / "rgba.tif"
        mbtiles = scratch / "tiles.mbtiles"
        wet_cells = colourise(cog, rgba, depth_max_ft, colormap)
        try:
            if wet_cells == 0:
                _write_empty_archive(rgba, partial, out_path.stem)
                provenance = {"backend": "empty-pmtiles-v3", "requested_backend": backend,
                              "empty": True, "tile_entries": 1,
                              "representation": "transparent-z0-sentinel"}
            elif backend == "gdal":
                cli = cli or _require_pmtiles_cli()
                _to_mbtiles(rgba, mbtiles, out_path.stem)
                _to_pmtiles(mbtiles, partial, cli)
                provenance = {"backend": "gdal", "version": gdal.VersionInfo(),
                              "base_resampling": "BILINEAR", "overview_resampling": "AVERAGE"}
            else:
                provenance = _to_terrio_pmtiles(rgba, partial, out_path.stem)
            # Read/validate the archive before replacing any existing good artifact.
            if wet_cells == 0:
                from ..common.empty_tiles import validate_empty_archive
                validate_empty_archive(partial)
            with partial.open("rb") as handle:
                import mmap
                with mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as mapping:
                    header = Reader(lambda offset, length: mapping[offset:offset + length]).header()
                    if header["tile_type"] != TileType.PNG:
                        raise DepthTileError("expected PNG raster PMTiles")
            os.replace(partial, out_path)
        finally:
            partial.unlink(missing_ok=True)
    return {
        "pmtiles": out_path,
        "bytes": out_path.stat().st_size,
        "wet_cells": wet_cells,
        "empty": wet_cells == 0,
        "provenance": provenance,
    }


def build_library(frontend: Path, out_root: Path, depth_max_ft: float, *,
                  colormap: str = DEFAULT_RAMP, verbose: bool = True,
                  backend: str = "terrio") -> dict:
    """Tile every COG under ``frontend/cogs`` into ``out_root/pmtiles/depth``."""
    cli = None
    cog_root = frontend / "cogs"
    if not cog_root.is_dir():
        raise DepthTileError(f"no cogs/ under {frontend}. Run pipeline.fim1d.cogs first.")

    cogs = sorted(cog_root.rglob("depth_*.tif"))
    if not cogs:
        raise DepthTileError(f"no depth_*.tif under {cog_root}")

    built: list[dict] = []
    total_bytes = 0
    for position, cog in enumerate(cogs, start=1):
        relative = cog.relative_to(cog_root).with_suffix(".pmtiles")
        out_path = out_root / "pmtiles" / "depth" / relative
        record = build_profile(
            cog, out_path, depth_max_ft, colormap=colormap, cli=cli, backend=backend)
        total_bytes += record["bytes"]
        built.append({
            "cog": cog.relative_to(frontend).as_posix(),
            "pmtiles": out_path.relative_to(out_root).as_posix(),
            "bytes": record["bytes"],
            "wet_cells": record["wet_cells"],
            "empty": record["empty"],
            "provenance": record["provenance"],
        })
        if verbose:
            print(f"  [{position:>3}/{len(cogs)}] {relative.as_posix()}  "
                  f"{record['bytes'] / 1024:.0f} KB  {record['wet_cells']:,} wet cells")

    return {
        "colormap": colormap,
        "depth_max_ft": depth_max_ft,
        "count": len(built),
        "total_bytes": total_bytes,
        "profiles": built,
    }


def _depth_max_from_manifest(frontend: Path) -> float | None:
    path = frontend / "manifest.json"
    if not path.is_file():
        return None
    manifest = json.loads(path.read_text(encoding="utf-8"))
    best = 0.0
    found = False
    for unit in manifest.get("units", []):
        for model in unit.get("models", []):
            fim = model.get("fim") or {}
            found = found or fim.get("depth_max_ft") is not None
            best = max(best, float(fim.get("depth_max_ft") or 0.0))
    return best if found else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="the 1D viewer root holding cogs/ (e.g. src/viewer-1d)")
    parser.add_argument("--out", help="where to write pmtiles/depth/ (default: alongside source)")
    parser.add_argument("--depth-max", type=float,
                        help="library maximum depth in feet; read from manifest.json when omitted")
    parser.add_argument("--colormap", default=DEFAULT_RAMP,
                        help=f"ramp name from pipeline/common/ramp.py (default: {DEFAULT_RAMP})")
    parser.add_argument("--report", help="write a JSON build report here")
    parser.add_argument("--backend", choices=("gdal", "terrio"), default="terrio",
                        help="experimental Terrio requires pixel/alpha acceptance before adoption")
    args = parser.parse_args(argv)

    frontend = Path(args.source).resolve()
    out_root = Path(args.out).resolve() if args.out else frontend
    if not frontend.is_dir():
        parser.error(f"source is not a directory: {frontend}")

    depth_max = args.depth_max if args.depth_max is not None else _depth_max_from_manifest(frontend)
    if depth_max is None:
        parser.error(
            "no --depth-max given and manifest.json does not carry one. The rescale must "
            "be the library maximum, so this cannot be guessed per profile.")

    try:
        report = build_library(
            frontend, out_root, depth_max, colormap=args.colormap, backend=args.backend)
    except DepthTileError as error:
        print(f"FAIL  {error}", file=sys.stderr)
        return 2

    print(f"\n  {report['count']} profile(s), {report['total_bytes'] / 1048576:.1f} MB total, "
          f"rescale 0-{depth_max:g} ft, ramp {report['colormap']}")
    if args.report:
        serialisable = dict(report)
        Path(args.report).write_text(json.dumps(serialisable, indent=2), encoding="utf-8")
        print(f"  report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
