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
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from osgeo import gdal

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
    if depth_max_ft <= 0:
        raise DepthTileError(f"depth_max_ft must be positive, got {depth_max_ft}")

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
    index = (np.clip(data / depth_max_ft, 0.0, 1.0) * 255).astype(np.uint8)
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
                  colormap: str = DEFAULT_RAMP, cli: str | None = None) -> dict:
    """Tile one profile. Returns a record for the manifest."""
    cli = cli or _require_pmtiles_cli()
    with tempfile.TemporaryDirectory(prefix="fim-depth-tiles-") as tmp:
        scratch = Path(tmp)
        rgba = scratch / "rgba.tif"
        mbtiles = scratch / "tiles.mbtiles"
        wet_cells = colourise(cog, rgba, depth_max_ft, colormap)
        _to_mbtiles(rgba, mbtiles, out_path.stem)
        _to_pmtiles(mbtiles, out_path, cli)
    return {
        "pmtiles": out_path,
        "bytes": out_path.stat().st_size,
        "wet_cells": wet_cells,
    }


def build_library(frontend: Path, out_root: Path, depth_max_ft: float, *,
                  colormap: str = DEFAULT_RAMP, verbose: bool = True) -> dict:
    """Tile every COG under ``frontend/cogs`` into ``out_root/pmtiles/depth``."""
    cli = _require_pmtiles_cli()
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
        record = build_profile(cog, out_path, depth_max_ft, colormap=colormap, cli=cli)
        total_bytes += record["bytes"]
        built.append({
            "cog": cog.relative_to(frontend).as_posix(),
            "pmtiles": out_path.relative_to(out_root).as_posix(),
            "bytes": record["bytes"],
            "wet_cells": record["wet_cells"],
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
    for unit in manifest.get("units", []):
        for model in unit.get("models", []):
            fim = model.get("fim") or {}
            best = max(best, float(fim.get("depth_max_ft") or 0.0))
    return best or None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="the 1D viewer root holding cogs/ (e.g. src/viewer-1d)")
    parser.add_argument("--out", help="where to write pmtiles/depth/ (default: alongside source)")
    parser.add_argument("--depth-max", type=float,
                        help="library maximum depth in feet; read from manifest.json when omitted")
    parser.add_argument("--colormap", default=DEFAULT_RAMP,
                        help=f"ramp name from pipeline/common/ramp.py (default: {DEFAULT_RAMP})")
    parser.add_argument("--report", help="write a JSON build report here")
    args = parser.parse_args(argv)

    frontend = Path(args.source).resolve()
    out_root = Path(args.out).resolve() if args.out else frontend
    if not frontend.is_dir():
        parser.error(f"source is not a directory: {frontend}")

    depth_max = args.depth_max or _depth_max_from_manifest(frontend)
    if not depth_max:
        parser.error(
            "no --depth-max given and manifest.json does not carry one. The rescale must "
            "be the library maximum, so this cannot be guessed per profile.")

    try:
        report = build_library(frontend, out_root, depth_max, colormap=args.colormap)
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
