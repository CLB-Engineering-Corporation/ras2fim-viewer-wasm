"""Assemble the browser catalog the FIM frontend loads at startup.

The manifest is the only contract between the pipeline and the map. It answers,
without a second request: what units exist, where they are, which vector archive
and which depth COGs belong to each, and -- for every profile -- what stage and
discharge each conflated NWM reach was carrying when that grid was produced.

Rating curves are embedded, not linked
--------------------------------------

A ras2fim library is a few dozen to a few hundred profiles per model, two or
three reaches each. That is a handful of kilobytes of numbers, and the map needs
all of it the moment the slider moves. Fetching a curve per reach would trade a
trivial payload for a visible stall on the one interaction the page exists for.

Depth scaling is computed, not guessed
--------------------------------------

``depth_max_ft`` is the maximum over the whole library, taken from the built
COGs rather than from the source's cached statistics. It is what the map uses to
hold one colour ramp fixed across every profile: rescaling per profile would
make a rising flood look like a constant one, which is the opposite of what the
slider is for.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from osgeo import gdal, ogr, osr

from ..common.geodesy import transform_bounds, union_bounds
from .source import Model, Unit, read_unit

gdal.UseExceptions()

SCHEMA_VERSION = 1

#: Fields carried from a rating curve into the manifest, in this order.
CURVE_FIELDS = ("stage_ft", "discharge_cfs", "wse_ft")


def cog_root_for(frontend: Path) -> Path:
    """Where fim1d/cogs.py writes, and what a COG path is made relative to."""
    return frontend / "cogs"


def _cog_bounds(path: Path) -> tuple[float, float, float, float]:
    ds = gdal.Open(str(path))
    if ds is None:
        raise RuntimeError(f"cannot open COG: {path}")
    bounds = transform_bounds(ds.GetGeoTransform(), ds.RasterXSize, ds.RasterYSize)
    ds = None
    return bounds


def _vector_bounds(path: Path) -> tuple[float, float, float, float] | None:
    """Extent of a source vector layer, in WGS84 lon/lat."""
    ds = gdal.OpenEx(str(path), gdal.OF_VECTOR)
    if ds is None:
        return None
    layer = ds.GetLayer(0)
    if layer is None:
        return None
    x0, x1, y0, y1 = layer.GetExtent()
    source = layer.GetSpatialRef()
    target = osr.SpatialReference()
    target.ImportFromEPSG(4326)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    ring = ogr.Geometry(ogr.wkbLinearRing)
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)):
        ring.AddPoint_2D(x, y)
    poly = ogr.Geometry(ogr.wkbPolygon)
    poly.AddGeometry(ring)
    if source is not None:
        poly.Transform(osr.CoordinateTransformation(source, target))
    bx0, bx1, by0, by1 = poly.GetEnvelope()
    ds = None
    return (bx0, by0, bx1, by1)


def _ras2fim_version(unit: Unit) -> str | None:
    """The ras2fim version stamped on the run's own domain product.

    The model catalog CSV does not carry it; ``models_domain.gpkg`` does, and it
    is written by the same run that produced the depth grids.
    """
    path = unit.vectors.get("models_domain")
    if path is None:
        return None
    ds = gdal.OpenEx(str(path), gdal.OF_VECTOR)
    if ds is None:
        return None
    layer = ds.GetLayer(0)
    index = layer.GetLayerDefn().GetFieldIndex("version")
    value = None
    if index >= 0:
        for feature in layer:
            value = feature.GetField(index)
            break
    ds = None
    return value or None


def _cross_section_counts(unit: Unit) -> dict[str, int]:
    """Cross sections per model, keyed by the model name in ``ras_path``."""
    counts: dict[str, int] = {}
    path = unit.vectors.get("ras_cross_sections")
    if path is None:
        return counts
    ds = gdal.OpenEx(str(path), gdal.OF_VECTOR)
    if ds is None:
        return counts
    layer = ds.GetLayer(0)
    index = layer.GetLayerDefn().GetFieldIndex("ras_path")
    if index >= 0:
        for feature in layer:
            raw = feature.GetField(index) or ""
            tail = raw.replace("\\", "/").rsplit("/", 1)[-1]
            key = tail.rsplit(".", 1)[0] if "." in tail else tail
            if key:
                counts[key] = counts.get(key, 0) + 1
    ds = None
    return counts


def _reach_curves(model: Model) -> list[dict]:
    """One entry per conflated NWM reach, with its curve as parallel arrays.

    Parallel arrays rather than a list of objects: the map indexes them by
    profile number on every slider move, and the key names would otherwise be
    repeated once per profile per reach for no benefit.
    """
    reaches = []
    for reach in model.reaches:
        indices = sorted(reach.points)
        entry: dict = {
            "feature_id": reach.feature_id,
            "xs_us": reach.xs_us,
            "xs_ds": reach.xs_ds,
            "profile_index": indices,
        }
        for field in CURVE_FIELDS:
            values = [reach.points[i].get(field) for i in indices]
            if any(v is not None for v in values):
                entry[field] = [round(v, 4) if v is not None else None for v in values]
        if stages := [v for v in entry.get("stage_ft", []) if v is not None]:
            entry["stage_range_ft"] = [min(stages), max(stages)]
        if flows := [v for v in entry.get("discharge_cfs", []) if v is not None]:
            entry["discharge_range_cfs"] = [min(flows), max(flows)]
        if len(stages) > 1:
            steps = sorted(round(b - a, 4) for a, b in zip(stages, stages[1:]))
            entry["stage_step_ft"] = {
                "min": steps[0],
                "median": steps[len(steps) // 2],
                "max": steps[-1],
            }
        entry["has_geocurve"] = reach.geocurve_csv is not None
        reaches.append(entry)
    return reaches


def _model_entry(
    unit: Unit, model: Model, cog_root: Path, frontend: Path, xs_counts: dict[str, int]
) -> tuple[dict, tuple | None]:
    cog_dir = cog_root / unit.unit_name / model.slug
    profiles: list[dict] = []
    bbox: tuple | None = None
    depth_max = 0.0

    for profile in model.profiles:
        cog = cog_dir / f"depth_{profile.index:03d}.tif"
        if not cog.is_file():
            continue
        ds = gdal.Open(str(cog))
        band = ds.GetRasterBand(1)
        # approx_ok=False is load-bearing. The approximate path reads the
        # overview pyramid, and these overviews carry the MEAN of each coarse
        # cell's wet contributors -- so it reports a smoothed maximum, not the
        # library's actual peak depth (17.5 ft instead of 31.8 ft on this unit).
        # The colour ramp is built from this number, so a low read would clip
        # the deepest water on every profile.
        lo, hi = band.ComputeRasterMinMax(False)
        ds = None
        bbox = union_bounds(bbox, _cog_bounds(cog))
        depth_max = max(depth_max, float(hi))
        record = {
            "index": profile.index,
            "label": profile.label,
            "cog": str(cog.relative_to(frontend)).replace("\\", "/"),
            "bytes": cog.stat().st_size,
            "depth_max_ft": round(float(hi), 3),
        }
        # A baked tile archive is optional. When one exists the viewer draws
        # from it and needs no tile service at all; when it does not, the viewer
        # falls back to rasterTileBase. Recording it here rather than in
        # config.js is deliberate: how depth is delivered is a property of the
        # release that was built, not of the machine viewing it.
        baked = frontend / "pmtiles" / "depth" / cog.relative_to(cog_root_for(frontend)).with_suffix(".pmtiles")
        if baked.is_file():
            record["depth_pmtiles"] = baked.relative_to(frontend).as_posix()
            record["depth_pmtiles_bytes"] = baked.stat().st_size
        profiles.append(record)

    if not profiles:
        raise RuntimeError(
            f"{model.slug}: no COGs under {cog_dir}. Run fim1d/cogs.py before fim1d/manifest.py."
        )

    entry = {
        "id": model.model_id,
        "name": model.name,
        "slug": model.slug,
        "source": model.catalog.get("source") or unit.source_name,
        "watershed": model.catalog.get("watershed"),
        "units": model.catalog.get("units") or unit.model_unit,
        "geometry_type": "1D",
        "num_cross_sections": xs_counts.get(model.name),
        "bbox": [round(v, 6) for v in bbox] if bbox else None,
        "fim": {
            "profile_count": len(profiles),
            "profile_range": [profiles[0]["index"], profiles[-1]["index"]],
            # ras2fim lays the second-pass profiles out at a uniform depth
            # interval at the model's CONTROLLING cross section -- the one with
            # maximum depth in the first pass. Every other section, and so every
            # conflated reach, sees its own non-uniform stage steps. There is
            # therefore no single stage interval for the model; each reach
            # reports the step it actually saw.
            "profile_spacing": "uniform depth at the model's controlling cross section",
            "depth_max_ft": round(depth_max, 3),
            "depth_unit": unit.model_unit,
            "arrival_depth_ft": 0,
            "profiles": profiles,
            "reaches": _reach_curves(model),
        },
    }
    return entry, bbox


def build_manifest(
    units: list[Unit],
    frontend: Path,
    *,
    title: str,
    description: str,
    titiler_base: str | None,
) -> dict:
    cog_root = frontend / "cogs"
    pmtiles_root = frontend / "pmtiles"

    catalog: list[dict] = []
    overall: tuple | None = None

    for unit in units:
        pmtiles = pmtiles_root / f"fim_{unit.unit_name}.pmtiles"
        if not pmtiles.is_file():
            raise RuntimeError(
                f"{unit.unit_name}: {pmtiles} missing. Run fim1d/pmtiles.py before fim1d/manifest.py."
            )

        xs_counts = _cross_section_counts(unit)
        models: list[dict] = []
        unit_bbox: tuple | None = None
        for model in unit.models:
            entry, bbox = _model_entry(unit, model, cog_root, frontend, xs_counts)
            models.append(entry)
            unit_bbox = union_bounds(unit_bbox, bbox) if bbox else unit_bbox

        # The vector layers reach past the FIM model -- 20 cataloged models
        # against one published library -- so they set the unit's extent.
        for name in ("ras_cross_sections", "ras_streams", "huc12"):
            if (path := unit.vectors.get(name)) and (b := _vector_bounds(path)):
                unit_bbox = union_bounds(unit_bbox, b)

        overall = union_bounds(overall, unit_bbox) if unit_bbox else overall
        catalog.append(
            {
                "unit": unit.unit_name,
                "huc8": unit.huc8,
                "name": (unit.models[0].catalog.get("watershed") if unit.models else None)
                or f"HUC8 {unit.huc8}",
                "source_crs": unit.crs,
                "source_code": unit.source_code,
                "source": unit.source_name,
                "model_unit": unit.model_unit,
                "process_date": unit.run_arguments.get("process_date") or unit.process_date,
                "ras2fim_version": _ras2fim_version(unit),
                "bbox": [round(v, 6) for v in unit_bbox] if unit_bbox else None,
                "pmtiles": str(pmtiles.relative_to(frontend)).replace("\\", "/"),
                "vector_layers": sorted(unit.vectors),
                "models": models,
                # The HUC8's candidate set, against which ``models`` is the
                # subset that produced a library. The map shows both, because
                # "20 models, one mapped" is the honest state of the unit.
                "models_cataloged": len(unit.catalog) or None,
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "title": title,
        "description": description,
        "bbox": [round(v, 6) for v in overall] if overall else None,
        "raster_service": {
            "kind": "titiler",
            "base_url": titiler_base,
            "note": "Depth COGs are served dynamically; base_url is set per deployment in config.js.",
        },
        "units": catalog,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("unit", nargs="+", help="ras2fim output unit directory (repeatable)")
    parser.add_argument("--out", required=True, help="the 1D viewer root to write manifest.json into")
    parser.add_argument("--title", default="ras2fim Flood Inundation Mapping")
    parser.add_argument(
        "--description",
        default="HEC-RAS model extents, geometry, and ras2fim depth-grid libraries by HUC8.",
    )
    parser.add_argument("--titiler-base", default=None, help="TiTiler base URL recorded in the manifest")
    parser.add_argument("--report", help="write the build report to this JSON path")
    args = parser.parse_args(argv)

    frontend = Path(args.out)
    units = [read_unit(u) for u in args.unit]
    manifest = build_manifest(
        units,
        frontend,
        title=args.title,
        description=args.description,
        titiler_base=args.titiler_base,
    )

    out = frontend / "manifest.json"
    out.write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    if args.report:
        Path(args.report).write_text(json.dumps({
            "manifest": str(out),
            "bytes": out.stat().st_size,
            "units": len(manifest["units"]),
            "bbox": manifest.get("bbox"),
        }, indent=2), encoding="utf-8")

    total_profiles = sum(m["fim"]["profile_count"] for u in manifest["units"] for m in u["models"])
    print(f"{out}: {out.stat().st_size / 1024:.0f} KB")
    print(f"  units {len(manifest['units'])}, models {sum(len(u['models']) for u in manifest['units'])}, profiles {total_profiles}")
    print(f"  bbox {manifest['bbox']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
