"""Publish a ras2fim unit's vector geometry as one PMTiles archive.

Everything vector a FIM unit produces -- model extents, HEC-RAS geometry, the
NWM conflation layers, and the inundation boundary -- goes into a single
archive per unit. The whole set is well under a megabyte for a HUC8, so
splitting it per model would add manifest surface and extra range requests for
nothing.

Per-layer zoom ranges, not one global range
-------------------------------------------

Model extents have to be visible before you know which model to look at, so they
start at the zoom where a HUC8 fills the screen. Cross sections and snap points
are noise at that scale and would triple the size of every overview tile, so
they start where they become legible. Publishing everything at every zoom is the
mistake that makes a small archive slow.

Model extents are derived, and say so
--------------------------------------

ras2fim publishes a domain polygon only for models it actually conflated and
processed. The other models in the HUC8 catalog have geometry but no domain, so
their extent is derived here as the convex hull of their cross sections and
stream centerline. A derived extent is a *reach envelope*, not the model's
computational boundary; ``extent_source`` records which one a feature is, and the
map must not present the two as the same thing.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from osgeo import gdal, ogr, osr

from .source import Unit, read_unit

gdal.UseExceptions()
ogr.UseExceptions()

#: PMTiles is a tiled format, so the layers are in Web Mercator's geographic
#: base. Everything is reprojected on the way in.
PUBLISH_EPSG = 4326

#: Per-layer (minzoom, maxzoom). z14 is the deepest stored level; MapLibre
#: overzooms past it cleanly, so storing z15+ only inflates the archive.
LAYER_ZOOMS: dict[str, tuple[int, int]] = {
    "ras_model_extents": (5, 14),
    "models_domain": (7, 14),
    "conflated_domain": (5, 14),
    "huc12": (7, 14),
    "ras_streams": (8, 14),
    "nwm_streams": (8, 14),
    "conflated_ras_streams": (8, 14),
    "ras_cross_sections": (10, 14),
    "ras_snap_points": (12, 14),
    "nwm_points_on_xs": (12, 14),
    "inundation_boundary": (8, 14),
}

#: Source layers copied through as-is, in draw order (bottom first).
PASSTHROUGH = (
    "huc12",
    "conflated_domain",
    "models_domain",
    "nwm_streams",
    "conflated_ras_streams",
    "ras_streams",
    "ras_cross_sections",
    "ras_snap_points",
    "nwm_points_on_xs",
)


class PmtilesError(RuntimeError):
    pass


def _srs(epsg: int) -> osr.SpatialReference:
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    # Without this, GDAL 3 honours the authority's axis order and EPSG:4326
    # comes back as (lat, lon), which silently transposes every coordinate.
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def _open_layer(path: Path) -> tuple[gdal.Dataset, ogr.Layer]:
    ds = gdal.OpenEx(str(path), gdal.OF_VECTOR)
    if ds is None:
        raise PmtilesError(f"cannot open vector: {path}")
    layer = ds.GetLayer(0)
    if layer is None:
        raise PmtilesError(f"no layer in: {path}")
    return ds, layer


def _model_key(ras_path: str | None) -> str | None:
    """``...\\ALUM 026.g01`` -> ``ALUM 026``.

    ``ras_path`` is the only column shared by the cross-section and stream
    layers, and it is a full Windows path in some products and a bare filename
    in others, so it is reduced to the model name both forms agree on.
    """
    if not ras_path:
        return None
    tail = ras_path.replace("\\", "/").rsplit("/", 1)[-1]
    return tail.rsplit(".", 1)[0] if "." in tail else tail


def _derive_model_extents(
    unit: Unit,
    out_ds: gdal.Dataset,
    fim_model_keys: set[str],
    domain_keys: set[str],
) -> int:
    """Build one extent polygon per model from its cross sections and stream."""
    target = _srs(PUBLISH_EPSG)
    collected: dict[str, ogr.Geometry] = {}
    counts: dict[str, int] = {}

    for layer_name in ("ras_cross_sections", "ras_streams"):
        path = unit.vectors.get(layer_name)
        if path is None:
            continue
        ds, layer = _open_layer(path)
        transform = osr.CoordinateTransformation(layer.GetSpatialRef(), target)
        for feature in layer:
            key = _model_key(feature.GetField("ras_path") if feature.GetFieldIndex("ras_path") >= 0 else None)
            if not key:
                continue
            geom = feature.GetGeometryRef()
            if geom is None:
                continue
            geom = geom.Clone()
            geom.Transform(transform)
            collected.setdefault(key, ogr.Geometry(ogr.wkbGeometryCollection)).AddGeometry(geom)
            if layer_name == "ras_cross_sections":
                counts[key] = counts.get(key, 0) + 1
        ds = None

    if not collected:
        return 0

    out_layer = out_ds.CreateLayer("ras_model_extents", target, ogr.wkbPolygon)
    for name, kind, width in (
        ("model_key", ogr.OFTString, 64),
        ("model_name", ogr.OFTString, 64),
        ("has_fim", ogr.OFTString, 8),
        ("extent_source", ogr.OFTString, 24),
        ("num_cross_sections", ogr.OFTInteger, 0),
        ("huc8", ogr.OFTString, 8),
    ):
        field = ogr.FieldDefn(name, kind)
        if width:
            field.SetWidth(width)
        out_layer.CreateField(field)

    definition = out_layer.GetLayerDefn()
    for key in sorted(collected):
        hull = collected[key].ConvexHull()
        if hull is None or hull.IsEmpty():
            continue
        feature = ogr.Feature(definition)
        feature.SetGeometry(hull)
        feature.SetField("model_key", key)
        feature.SetField("model_name", key)
        feature.SetField("has_fim", "yes" if key in fim_model_keys else "no")
        feature.SetField(
            "extent_source",
            "ras2fim_domain" if key in domain_keys else "derived_hull",
        )
        feature.SetField("num_cross_sections", counts.get(key, 0))
        feature.SetField("huc8", unit.huc8)
        out_layer.CreateFeature(feature)
        feature = None

    return out_layer.GetFeatureCount()


def _multi_type(geom_type: int) -> int:
    """Promote a single-part geometry type to its collection type.

    A shapefile declares ``Polygon`` in its header and then stores multipart
    rings as ``MultiPolygon`` features -- the format does not distinguish them.
    Declaring the collection type up front avoids a per-feature coercion warning
    and, more importantly, keeps GDAL from having to guess.
    """
    promoted = ogr.GT_GetCollection(geom_type)
    return promoted if promoted != ogr.wkbNone else geom_type


def _copy_layer(src_path: Path, out_ds: gdal.Dataset, name: str, extra: dict[str, str] | None = None) -> int:
    """Reproject one source layer into the staging dataset under ``name``."""
    ds, layer = _open_layer(src_path)
    target = _srs(PUBLISH_EPSG)
    transform = osr.CoordinateTransformation(layer.GetSpatialRef(), target)

    out_type = _multi_type(layer.GetGeomType())
    out_layer = out_ds.CreateLayer(name, target, out_type)
    src_defn = layer.GetLayerDefn()
    for i in range(src_defn.GetFieldCount()):
        out_layer.CreateField(src_defn.GetFieldDefn(i))
    for key in (extra or {}):
        out_layer.CreateField(ogr.FieldDefn(key, ogr.OFTString))

    out_defn = out_layer.GetLayerDefn()
    for feature in layer:
        geom = feature.GetGeometryRef()
        if geom is None:
            continue
        geom = geom.Clone()
        geom.Transform(transform)
        # The layer was declared as the collection type, so single-part features
        # are promoted to match rather than written against a mismatched header.
        if ogr.GT_IsSubClassOf(out_type, ogr.wkbMultiPolygon):
            geom = ogr.ForceToMultiPolygon(geom)
        elif ogr.GT_IsSubClassOf(out_type, ogr.wkbMultiLineString):
            geom = ogr.ForceToMultiLineString(geom)
        elif ogr.GT_IsSubClassOf(out_type, ogr.wkbMultiPoint):
            geom = ogr.ForceToMultiPoint(geom)
        out_feature = ogr.Feature(out_defn)
        out_feature.SetGeometry(geom)
        for i in range(src_defn.GetFieldCount()):
            out_feature.SetField(src_defn.GetFieldDefn(i).GetNameRef(), feature.GetField(i))
        for key, value in (extra or {}).items():
            out_feature.SetField(key, value)
        out_layer.CreateFeature(out_feature)
        out_feature = None

    count = out_layer.GetFeatureCount()
    ds = None
    return count


def build_unit_pmtiles(unit: Unit, out_path: Path, *, verbose: bool = True) -> dict:
    """Write one PMTiles archive holding every vector layer for ``unit``."""
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Staged as GPKG first: the PMTiles writer needs every layer present at
    # translate time so it can assign each one its own zoom range in a single
    # tiling pass.
    staging = out_path.with_suffix(".staging.gpkg")
    staging.unlink(missing_ok=True)
    stage_ds = gdal.GetDriverByName("GPKG").Create(str(staging), 0, 0, 0, gdal.GDT_Unknown)
    if stage_ds is None:
        raise PmtilesError(f"cannot create staging geopackage: {staging}")

    counts: dict[str, int] = {}
    try:
        fim_model_keys = {m.name for m in unit.models}
        domain_keys: set[str] = set()
        if (domain := unit.vectors.get("models_domain")) is not None:
            ds, layer = _open_layer(domain)
            for feature in layer:
                idx = feature.GetFieldIndex("ras_path")
                if idx >= 0 and (key := _model_key(feature.GetField(idx))):
                    domain_keys.add(key)
            ds = None

        if extents := _derive_model_extents(unit, stage_ds, fim_model_keys, domain_keys):
            counts["ras_model_extents"] = extents

        for name in PASSTHROUGH:
            path = unit.vectors.get(name)
            if path is None:
                continue
            counts[name] = _copy_layer(path, stage_ds, name)

        # The inundation boundary is written by RASMapper at the top profile
        # only. It is the model's maximum published extent, so it is labelled
        # with the profile it came from rather than presented as "the" extent.
        for model in unit.models:
            for profile in model.profiles:
                if profile.inundation_shp is None:
                    continue
                counts["inundation_boundary"] = _copy_layer(
                    profile.inundation_shp,
                    stage_ds,
                    "inundation_boundary",
                    extra={
                        "model_id": model.model_id,
                        "model_name": model.name,
                        "profile_index": str(profile.index),
                        "profile_label": profile.label,
                    },
                )
                break
        stage_ds.FlushCache()
    finally:
        stage_ds = None

    present = [name for name in LAYER_ZOOMS if name in counts]
    minzoom = min(LAYER_ZOOMS[n][0] for n in present)
    maxzoom = max(LAYER_ZOOMS[n][1] for n in present)

    options = [
        "MINZOOM=%d" % minzoom,
        "MAXZOOM=%d" % maxzoom,
        f"NAME={unit.unit_name}",
        f"DESCRIPTION=ras2fim vector geometry for HUC8 {unit.huc8}",
        "TYPE=overlay",
        # Dropping features to hit a tile budget would silently delete cross
        # sections from the map. These layers are small enough that the budget
        # is never the binding constraint, so the limit is raised rather than
        # letting the writer decide what to lose.
        "MAX_SIZE=10000000",
        "MAX_FEATURES=500000",
        f"CONF={json.dumps({n: {'minzoom': LAYER_ZOOMS[n][0], 'maxzoom': LAYER_ZOOMS[n][1]} for n in present})}",
    ]

    out_path.unlink(missing_ok=True)
    gdal.VectorTranslate(
        str(out_path),
        str(staging),
        format="PMTiles",
        datasetCreationOptions=options,
        layers=present,
    )
    staging.unlink(missing_ok=True)

    if not out_path.is_file():
        raise PmtilesError(f"PMTiles writer produced nothing: {out_path}")

    report = {
        "pmtiles": out_path.name,
        "bytes": out_path.stat().st_size,
        "layers": present,
        "layer_counts": {n: counts[n] for n in present},
        "layer_zooms": {n: list(LAYER_ZOOMS[n]) for n in present},
    }
    if verbose:
        print(f"  {out_path.name}: {report['bytes'] / 1024:.0f} KB")
        for name in present:
            lo, hi = LAYER_ZOOMS[name]
            print(f"    {name}: {counts[name]:,} features, z{lo}-{hi}")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("unit", help="ras2fim output unit directory")
    parser.add_argument("--out", required=True, help="frontend pmtiles/ directory")
    parser.add_argument("--report", help="write the build report to this JSON path")
    args = parser.parse_args(argv)

    unit = read_unit(args.unit)
    out_path = Path(args.out) / f"fim_{unit.unit_name}.pmtiles"
    print(f"{unit.unit_name}  HUC8 {unit.huc8}  {unit.crs} -> EPSG:{PUBLISH_EPSG}")
    report = build_unit_pmtiles(unit, out_path)

    if args.report:
        Path(args.report).write_text(
            json.dumps({"unit": unit.unit_name, **report}, indent=2), encoding="utf-8"
        )
        print(f"report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
