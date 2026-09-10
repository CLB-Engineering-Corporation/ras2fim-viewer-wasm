"""Publish a ras2fim depth-grid library as web-servable COGs.

One COG per profile, warped to EPSG:4326 and finished through
:mod:`cog_postprocess` so every raster in the library carries the same overview,
codec, and validation contract.

Why the warp is nearest-neighbour
---------------------------------

A depth grid is a wet/dry surface: the value is a depth *and* the nodata carries
an inundation mask. Bilinear or cubic resampling at the wet edge invents depths
by averaging against nodata, which both blurs the extent and fabricates values
that no profile produced. ``near`` moves each cell's value without inventing
one. Zoom-level correctness is not this step's job -- that is what the
area-matched pyramid in :func:`cog_postprocess.finish_cog` is for.

Why depths are not filtered by default
--------------------------------------

ras2fim writes its grids with ``ArrivalDepth=0``: every wet cell is mapped, with
no minimum-depth threshold. Dropping shallow cells here would publish an extent
narrower than the one ras2fim produced, and the difference would be invisible
downstream. ``--min-depth`` exists for when that is wanted deliberately, and the
threshold is then stamped into every affected COG.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

from osgeo import gdal

from . import cog_postprocess as cp
from .source import Model, Unit, read_unit

gdal.UseExceptions()

#: Published raster CRS. TiTiler reprojects on request, but publishing in one
#: known geographic CRS keeps the plausibility guard meaningful and makes every
#: raster in the catalog directly comparable.
PUBLISH_CRS = "EPSG:4326"


def _stage_dir(out_root: Path) -> Path:
    staging = out_root / ".staging"
    staging.mkdir(parents=True, exist_ok=True)
    return staging


def _warp_to_publish_crs(
    src: Path,
    dst: Path,
    *,
    src_crs: str | None,
    min_depth: float | None,
) -> tuple[float, float, int]:
    """Warp one depth grid to :data:`PUBLISH_CRS`. Returns (min, max, wet cells).

    Statistics come from the warped array rather than the source's cached
    ``STATISTICS_*`` tags: those are computed by whatever wrote the file, may be
    approximate, and say nothing about what survived the warp.
    """
    import numpy as np

    options = {
        "dstSRS": PUBLISH_CRS,
        "resampleAlg": "near",
        "dstNodata": cp.NODATA,
        "format": "GTiff",
        "creationOptions": ["TILED=YES", f"BLOCKXSIZE={cp.BLOCKSIZE}", f"BLOCKYSIZE={cp.BLOCKSIZE}"],
        "multithread": True,
    }
    if src_crs:
        # Only for a source that genuinely lacks projection metadata. Never use
        # this to "correct" a CRS that is present but looks wrong -- see the
        # foot/metre note in cog_postprocess.assert_wgs84_bounds.
        options["srcSRS"] = src_crs

    gdal.Warp(str(dst), str(src), **options)

    ds = gdal.Open(str(dst), gdal.GA_Update)
    if ds is None:
        raise cp.CogError(f"warp produced an unreadable file: {dst}")
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray()
    wet = cp.wet_mask(arr, cp.NODATA)

    if min_depth is not None:
        # Applied after the warp so the threshold is in published depth units and
        # cannot be smeared across the wet edge by resampling.
        drop = wet & (arr <= min_depth)
        if drop.any():
            arr = arr.copy()
            arr[drop] = cp.NODATA
            band.WriteArray(arr)
            wet = cp.wet_mask(arr, cp.NODATA)

    wet_count = int(wet.sum())
    lo = float(arr[wet].min()) if wet_count else 0.0
    hi = float(arr[wet].max()) if wet_count else 0.0

    band.SetNoDataValue(cp.NODATA)
    ds.FlushCache()
    ds = None
    del arr, wet
    return lo, hi, wet_count


def build_model(
    unit: Unit,
    model: Model,
    out_root: Path,
    *,
    min_depth: float | None = None,
    src_crs: str | None = None,
    limit: int | None = None,
    force: bool = False,
    verbose: bool = True,
) -> dict:
    """Build every profile COG for one model. Returns a report dict."""
    dest = out_root / unit.unit_name / model.slug
    dest.mkdir(parents=True, exist_ok=True)
    staging = _stage_dir(out_root)

    profiles = model.profiles[:limit] if limit else model.profiles
    built: list[dict] = []
    t0 = time.time()

    for profile in profiles:
        name = f"depth_{profile.index:03d}.tif"
        target = dest / name

        if target.is_file() and not force:
            if verbose:
                print(f"    {name}: exists, skipping (use --force to rebuild)")
            ds = gdal.Open(str(target))
            band = ds.GetRasterBand(1)
            lo, hi = band.ComputeRasterMinMax(True)
            built.append(
                {
                    "index": profile.index,
                    "label": profile.label,
                    "cog": name,
                    "bytes": target.stat().st_size,
                    "depth_min_ft": round(lo, 4),
                    "depth_max_ft": round(hi, 4),
                    "reused": True,
                }
            )
            ds = None
            continue

        stage = staging / f"{model.slug}_{name}"
        try:
            lo, hi, wet = _warp_to_publish_crs(
                profile.depth_tif, stage, src_crs=src_crs, min_depth=min_depth
            )
            if wet == 0:
                # profile 0 can legitimately be nearly dry; an entirely dry grid
                # is still published so the slider has no gaps, but it is called
                # out because it usually means a bad warp, not a dry model.
                print(f"    {name}: WARNING no wet cells after warp")

            metadata = {
                "FIM_PRODUCT": "depth",
                "FIM_UNIT": unit.unit_name,
                "FIM_HUC8": unit.huc8,
                "FIM_MODEL_ID": model.model_id,
                "FIM_MODEL_NAME": model.name,
                "FIM_PROFILE_INDEX": str(profile.index),
                "FIM_PROFILE_LABEL": profile.label,
                "FIM_DEPTH_UNIT": unit.model_unit,
                "FIM_SOURCE_CRS": unit.crs,
                "FIM_SOURCE_FILE": profile.depth_tif.name,
                "FIM_ARRIVAL_DEPTH": "0",
            }
            if min_depth is not None:
                metadata["FIM_MIN_DEPTH_FILTER"] = str(min_depth)

            report = cp.finish_cog(
                stage,
                target,
                categorical=False,
                overview_method="area_matched",
                nodata=cp.NODATA,
                extra_metadata=metadata,
                label=f"{model.slug} {profile.label}",
                verbose=False,
            )
            built.append(
                {
                    "index": profile.index,
                    "label": profile.label,
                    "cog": name,
                    "bytes": target.stat().st_size,
                    "depth_min_ft": round(lo, 4),
                    "depth_max_ft": round(hi, 4),
                    "wet_cells": wet,
                    "overviews": report.get("overviews", {}).get("factors"),
                }
            )
            if verbose:
                print(
                    f"    {name}: {target.stat().st_size / 1024:.0f} KB, "
                    f"depth {lo:.2f}-{hi:.2f} ft, {wet:,} wet cells"
                )
        finally:
            stage.unlink(missing_ok=True)
            for sidecar in staging.glob(f"{stage.name}.*"):
                sidecar.unlink(missing_ok=True)

    depths = [b["depth_max_ft"] for b in built if b.get("depth_max_ft") is not None]
    return {
        "model_id": model.model_id,
        "model_name": model.name,
        "slug": model.slug,
        "directory": str(dest.relative_to(out_root)).replace("\\", "/"),
        "publish_crs": PUBLISH_CRS,
        "profile_count": len(built),
        "depth_max_ft": round(max(depths), 4) if depths else None,
        "min_depth_filter_ft": min_depth,
        "total_bytes": sum(b["bytes"] for b in built),
        "seconds": round(time.time() - t0, 1),
        "profiles": built,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("unit", help="ras2fim output unit directory")
    parser.add_argument("--out", required=True, help="COG output root (frontend cogs/ directory)")
    parser.add_argument("--model", action="append", help="model id to build; repeatable, default all")
    parser.add_argument(
        "--min-depth",
        type=float,
        default=None,
        help="drop cells at or below this depth (published units). Off by default: "
        "ras2fim maps every wet cell, and filtering here narrows the published extent.",
    )
    parser.add_argument("--src-crs", help="source CRS override, only for rasters missing projection metadata")
    parser.add_argument("--limit", type=int, help="build only the first N profiles (smoke test)")
    parser.add_argument("--force", action="store_true", help="rebuild COGs that already exist")
    parser.add_argument("--report", help="write the build report to this JSON path")
    args = parser.parse_args(argv)

    unit = read_unit(args.unit)
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    wanted = set(args.model or [])
    models = [m for m in unit.models if not wanted or m.model_id in wanted]
    if not models:
        parser.error(f"no model matched {sorted(wanted)}; unit has {[m.model_id for m in unit.models]}")

    print(f"{unit.unit_name}  HUC8 {unit.huc8}  {unit.crs} -> {PUBLISH_CRS}")
    reports = []
    for model in models:
        print(f"  {model.model_id} {model.name}: {len(model.profiles)} profiles")
        reports.append(
            build_model(
                unit,
                model,
                out_root,
                min_depth=args.min_depth,
                src_crs=args.src_crs,
                limit=args.limit,
                force=args.force,
            )
        )

    staging = out_root / ".staging"
    if staging.is_dir() and not any(staging.iterdir()):
        shutil.rmtree(staging, ignore_errors=True)

    total = sum(r["total_bytes"] for r in reports)
    print(f"\n{len(reports)} model(s), {sum(r['profile_count'] for r in reports)} COGs, {total / 1024 / 1024:.1f} MB")

    if args.report:
        payload = {"unit": unit.unit_name, "huc8": unit.huc8, "publish_crs": PUBLISH_CRS, "models": reports}
        Path(args.report).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
