"""Catalog a directory of ras2fim-2d NetCDF files for the browser viewer.

The viewer reads almost everything it needs out of each ``.nc`` at load time --
grid, packing, flows, georeferencing. This produces the one thing it cannot
know before opening a file: which files exist, and roughly where and how big
they are, so the picker can be populated and the map can fit the right extent
without downloading anything first.

Unlike the 1D pipeline, this needs no GDAL and no conversion step. It opens
each file read-only, copies out a handful of numbers, and writes JSON. The
files themselves are published exactly as ras2fim-2d wrote them.

    python -m pipeline.fim2d.manifest <dir-of-nc> --out <dir>/manifest.json
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import netCDF4

from ..common.geodesy import grid_bounds_lonlat, parse_geotransform, union_bounds

SCHEMA_VERSION = 1

def _attr(obj, name, default=None):
    try:
        value = obj.getncattr(name)
    except (AttributeError, KeyError):
        return default
    # netCDF4 hands back numpy scalars and 1-element arrays for some attributes.
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, list) and len(value) == 1:
        value = value[0]
    return value


def describe(path: Path, root: Path) -> dict | None:
    """Describe one NetCDF, or return None if it is not a ras2fim-2d stack."""
    with netCDF4.Dataset(path) as nc:
        variable = _attr(nc, "01_type") or next(
            (n for n in ("wsel", "depth") if n in nc.variables), None
        )
        if variable not in ("wsel", "depth") or variable not in nc.variables:
            return None
        if "flow" not in nc.variables:
            return None
        # A wsel stack needs terrain subtracted from it; a depth stack is already
        # depth and carries none. Requiring terrain unconditionally rejected a
        # perfectly valid depth product.
        if variable == "wsel" and "terrain" not in nc.variables:
            return None

        var = nc.variables[variable]
        if var.ndim != 3:
            return None
        n_flow, ny, nx = var.shape
        if variable == "wsel" and nc.variables["terrain"].shape != (ny, nx):
            return None

        # The extent comes from GeoTransform, not the x/y vectors: those are
        # cell centres, and using them as an extent shifts the raster half a
        # cell. Without it there is nothing reliable to fit the map to.
        gt = None
        if "spatial_ref" in nc.variables:
            gt = parse_geotransform(_attr(nc.variables["spatial_ref"], "GeoTransform"))
        if gt is None:
            return None
        # Four corners cannot place a rotated grid; the viewer refuses these too,
        # so do not advertise one it will fail to draw.
        try:
            lon_w, lat_s, lon_e, lat_n = grid_bounds_lonlat(gt, nx, ny)
        except Exception:
            return None
        pixel_w = gt["pixel_w"]

        # Flows are not necessarily integers. int() would turn 1.75 into 1 and
        # mislabel the slider with a discharge the model never ran.
        raw_flows = nc.variables["flow"][:].tolist()
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in raw_flows):
            return None
        flows = [int(v) if float(v).is_integer() else float(v) for v in raw_flows]
        return {
            "id": _attr(nc, "00_stream_id") or path.stem,
            "file": path.relative_to(root).as_posix(),
            "bytes": path.stat().st_size,
            "variable": variable,
            "mode": variable,
            "grid": {"nx": int(nx), "ny": int(ny), "cell_size_m": abs(pixel_w)},
            "flow_count": int(n_flow),
            "flow_range": [flows[0], flows[-1]] if flows else None,
            "flow_units": _attr(nc.variables["flow"], "units", "cfs"),
            "vertical_units": _attr(var, "units", "feet"),
            "vertical_filter": _attr(nc, "09_vertical_filter"),
            "bounds": [round(lon_w, 6), round(lat_s, 6), round(lon_e, 6), round(lat_n, 6)],
        }


def build(source: Path, root: Path, title: str, attribution: str | None) -> dict:
    streams: list[dict] = []
    skipped: list[str] = []

    for path in sorted(source.rglob("*.nc")):
        try:
            entry = describe(path, root)
        except (OSError, RuntimeError) as error:
            skipped.append(f"{path.name}: {error}")
            continue
        if entry is None:
            skipped.append(f"{path.name}: not a ras2fim-2d wsel/depth stack")
            continue
        streams.append(entry)

    for message in skipped:
        print(f"  skip  {message}")

    bounds = None
    for entry in streams:
        bounds = union_bounds(bounds, tuple(entry["bounds"]))
    bounds = list(bounds) if bounds else None

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "title": title,
        "attribution": attribution,
        "bounds": bounds,
        "total_bytes": sum(e["bytes"] for e in streams),
        "streams": streams,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="directory to scan for .nc files (searched recursively)")
    parser.add_argument("--out", required=True, help="manifest.json path to write")
    parser.add_argument(
        "--root",
        help="directory the 'file' paths are relative to; defaults to the manifest's own directory",
    )
    parser.add_argument("--title", default="ras2fim-2d flood inundation")
    parser.add_argument(
        "--attribution",
        help="shown in the viewer; use it to credit whoever produced the model output",
    )
    args = parser.parse_args(argv)

    source = Path(args.source).resolve()
    if not source.is_dir():
        parser.error(f"not a directory: {source}")
    out = Path(args.out).resolve()
    root = Path(args.root).resolve() if args.root else out.parent

    manifest = build(source, root, args.title, args.attribution)
    if not manifest["streams"]:
        print(f"FAIL  no ras2fim-2d NetCDF found under {source}")
        return 1

    out.parent.mkdir(parents=True, exist_ok=True)
    # allow_nan=False: json.dumps happily emits bare NaN/Infinity, which is not
    # valid JSON and fails in the browser at JSON.parse, far from the cause.
    out.write_text(json.dumps(manifest, indent=1, allow_nan=False), encoding="utf-8")

    print(f"{out}: {len(manifest['streams'])} stream(s), "
          f"{manifest['total_bytes'] / 1e6:.2f} MB total")
    for entry in manifest["streams"]:
        print(f"  {entry['id']:<16} {entry['grid']['nx']}x{entry['grid']['ny']} "
              f"{entry['flow_count']:>3} flows  {entry['bytes'] / 1e6:5.2f} MB  {entry['file']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
