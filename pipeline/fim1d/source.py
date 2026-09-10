"""Read a ras2fim output unit and describe what it published.

A ras2fim run writes one *unit* directory named ``<huc8>_<crs>_<source>_<date>``
(for example ``12090301_2277_ble_260901``). This module is the single place that
knows that directory's shape, so every downstream builder works against a
described object instead of re-globbing the tree.

Nothing here writes files or reprojects anything. Discovery must stay cheap and
side-effect free: the COG builder, the PMTiles builder, and the manifest builder
all call it, and two of those run before any output directory exists.

What the layout means
---------------------

``05_hecras_output/<model_id>_<model_name>/<model_name>/`` is the FIM library
itself -- one ``Depth (flow<N>_ft)`` GeoTIFF per profile, written by RASMapper
during the second hydraulic pass. ``N`` is the zero-based ``ProfileIndex``, and
it is the join key for everything else: ``profile_num`` in the rating curves and
in the geocurves is the same index. The profiles are laid out at a uniform depth
interval at the model's controlling cross section, so the library is uniformly
spaced in *stage*, not in discharge -- which is what the map's slider wants.

Rating curves are per NWM ``feature_id``, not per model. One model can conflate
to several reaches, and each reach reports its own stage and discharge at the
same profile index. The map therefore has one profile control and one readout
per reach.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

# ``Depth (flow12_ft).50009.50009.tif`` -- the trailing dotted segments are the
# terrain name RASMapper appends, and they vary, so only the profile is matched.
DEPTH_RE = re.compile(r"^Depth \(flow(\d+)_ft\)\..*\.tif$", re.IGNORECASE)

# ``Inundation Boundary (flow71_ft Value_0).shp``
BOUNDARY_RE = re.compile(r"^Inundation Boundary \(flow(\d+)_ft Value_0?\)?\.shp$", re.IGNORECASE)

# ``12090301_2277_ble_260901``
UNIT_RE = re.compile(r"^(\d{8})_(\d+)_([a-z0-9]+)_(\d{6})$", re.IGNORECASE)

# ``5789842_50009_ALUM 026_geocurve.csv``
GEOCURVE_RE = re.compile(r"^(\d+)_(\d+)_(.+)_geocurve\.csv$", re.IGNORECASE)


class SourceError(RuntimeError):
    """The unit directory is not a ras2fim output unit, or is incomplete."""


@dataclass
class Profile:
    """One depth grid and the hydraulics that produced it."""

    index: int
    label: str  # "flow12_ft" -- the RAS ProfileName, cosmetic but useful in UI
    depth_tif: Path
    depth_vrt: Path | None = None
    inundation_shp: Path | None = None


@dataclass
class Reach:
    """One NWM feature the model conflated to, with its rating curve."""

    feature_id: str
    rating_curve_csv: Path
    geocurve_csv: Path | None = None
    xs_us: str | None = None
    xs_ds: str | None = None
    # profile_num -> {"stage_ft", "discharge_cfs", "wse_ft", "stage_m", "discharge_cms"}
    points: dict[int, dict[str, float]] = field(default_factory=dict)


@dataclass
class Model:
    """One HEC-RAS model that produced a FIM library."""

    model_id: str
    name: str
    output_dir: Path  # 05_hecras_output/<model_id>_<name>
    fim_dir: Path  # .../<name>, where the depth grids live
    profiles: list[Profile] = field(default_factory=list)
    reaches: list[Reach] = field(default_factory=list)
    terrain_tif: Path | None = None
    catalog: dict[str, str] = field(default_factory=dict)

    @property
    def slug(self) -> str:
        """Filesystem- and URL-safe stem. Model names contain spaces."""
        return re.sub(r"[^A-Za-z0-9]+", "_", f"{self.model_id}_{self.name}").strip("_")


@dataclass
class Unit:
    """One ras2fim output unit directory."""

    root: Path
    unit_name: str
    huc8: str
    crs: str  # "EPSG:2277"
    source_code: str  # "ble"
    process_date: str  # "260901" as written in the directory name
    run_arguments: dict[str, str] = field(default_factory=dict)
    models: list[Model] = field(default_factory=list)
    # Layer name -> path, for the conflation and geometry vector products.
    vectors: dict[str, Path] = field(default_factory=dict)
    # Every model ras2fim considered, keyed by model_id. Far larger than
    # ``models``: the catalog is the HUC8's candidate set, while ``models`` is
    # the subset that conflated and produced a depth-grid library.
    catalog: dict[str, dict[str, str]] = field(default_factory=dict)

    @property
    def source_name(self) -> str:
        return self.run_arguments.get("source_name", self.source_code.upper())

    @property
    def model_unit(self) -> str:
        """"feet" or "meter" -- ras2fim records the RAS model's unit system."""
        return self.run_arguments.get("model_unit", "feet")


def _read_run_arguments(path: Path) -> dict[str, str]:
    """Parse ``run_arguments.txt``, which is ``key == value`` per line."""
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "==" not in line:
            continue
        key, _, value = line.partition("==")
        out[key.strip()] = value.strip()
    return out


def _read_catalog(path: Path) -> dict[str, dict[str, str]]:
    """``OWP_ras_models_catalog_<huc8>.csv`` keyed by ``model_id``."""
    if not path.is_file():
        return {}
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as fh:
        return {row["model_id"]: row for row in csv.DictReader(fh) if row.get("model_id")}


def _find_vectors(root: Path) -> dict[str, Path]:
    """Locate the geometry and conflation layers a webmap can publish.

    Keys are the stable layer names used in PMTiles and in the manifest; missing
    inputs are simply absent, because an optional ras2fim step that was disabled
    is a normal run, not an error.
    """
    shapes = root / "01_shapes_from_hecras"
    conflation = root / "02_csv_shapes_from_conflation"
    domain = root / "final" / "models_domain"

    candidates: dict[str, Path] = {
        "ras_cross_sections": shapes / "cross_section_LN_from_ras.shp",
        "ras_streams": shapes / "stream_LN_from_ras.shp",
        "models_domain": domain / "models_domain.gpkg",
        "conflated_domain": domain / "dissolved_conflated_models.gpkg",
    }

    # The conflation layers are HUC8-prefixed, so they are matched by suffix.
    if conflation.is_dir():
        for suffix, layer in (
            ("_nwm_streams_ln.shp", "nwm_streams"),
            ("_ras_streams_ln.shp", "conflated_ras_streams"),
            ("_nwm_points_on_xs_PT.shp", "nwm_points_on_xs"),
            ("_ras_snap_points_PT.shp", "ras_snap_points"),
            ("_huc_12_ar.shp", "huc12"),
        ):
            for path in conflation.glob(f"*{suffix}"):
                candidates[layer] = path
                break

    return {name: path for name, path in candidates.items() if path.is_file()}


def _read_rating_curve(path: Path) -> tuple[dict[int, dict[str, float]], str | None, str | None]:
    """Return ``{profile_num: hydraulics}`` plus the model's US/DS cross sections."""
    points: dict[int, dict[str, float]] = {}
    xs_us = xs_ds = None
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as fh:
        for row in csv.DictReader(fh):
            try:
                index = int(row["profile_num"])
            except (KeyError, TypeError, ValueError):
                continue
            xs_us = xs_us or (row.get("xs_us") or None)
            xs_ds = xs_ds or (row.get("xs_ds") or None)
            point: dict[str, float] = {}
            for key in ("discharge_cfs", "discharge_cms", "wse_ft", "stage_ft", "stage_m"):
                raw = row.get(key)
                if raw in (None, ""):
                    continue
                try:
                    point[key] = float(raw)
                except ValueError:
                    continue
            points[index] = point
    return points, xs_us, xs_ds


def _discover_profiles(fim_dir: Path) -> list[Profile]:
    profiles: dict[int, Profile] = {}
    for path in fim_dir.iterdir():
        match = DEPTH_RE.match(path.name)
        if not match:
            continue
        index = int(match.group(1))
        vrt = fim_dir / f"Depth (flow{index}_ft).vrt"
        profiles[index] = Profile(
            index=index,
            label=f"flow{index}_ft",
            depth_tif=path,
            depth_vrt=vrt if vrt.is_file() else None,
        )

    # The inundation boundary is written only at the top profile, so it is
    # attached where it belongs rather than assumed to exist for every profile.
    for path in fim_dir.glob("Inundation Boundary (*).shp"):
        match = BOUNDARY_RE.match(path.name)
        if match and (index := int(match.group(1))) in profiles:
            profiles[index].inundation_shp = path

    return [profiles[i] for i in sorted(profiles)]


def _discover_reaches(unit_root: Path, model_id: str, model_name: str) -> list[Reach]:
    curve_dir = unit_root / "06_create_rating_curves" / f"{model_id}_{model_name}"
    geo_dir = unit_root / "final" / "geo_rating_curves"

    geocurves: dict[str, Path] = {}
    if geo_dir.is_dir():
        for path in geo_dir.glob("*_geocurve.csv"):
            match = GEOCURVE_RE.match(path.name)
            if match and match.group(2) == model_id:
                geocurves[match.group(1)] = path

    reaches: list[Reach] = []
    if curve_dir.is_dir():
        for path in sorted(curve_dir.glob("rating_curve_*.csv")):
            feature_id = path.stem.removeprefix("rating_curve_")
            points, xs_us, xs_ds = _read_rating_curve(path)
            reaches.append(
                Reach(
                    feature_id=feature_id,
                    rating_curve_csv=path,
                    geocurve_csv=geocurves.get(feature_id),
                    xs_us=xs_us,
                    xs_ds=xs_ds,
                    points=points,
                )
            )
    return reaches


def _discover_models(unit_root: Path, catalog: dict[str, dict[str, str]]) -> list[Model]:
    hecras_output = unit_root / "05_hecras_output"
    if not hecras_output.is_dir():
        return []

    models: list[Model] = []
    for model_dir in sorted(p for p in hecras_output.iterdir() if p.is_dir()):
        model_id, _, model_name = model_dir.name.partition("_")
        if not model_id or not model_name:
            continue

        # RASMapper writes the grids into a subdirectory named for the RAS
        # project. It is normally the model name, but the directory is located
        # by looking for depth grids rather than by trusting the name.
        fim_dir = next(
            (
                child
                for child in sorted(p for p in model_dir.iterdir() if p.is_dir())
                if any(DEPTH_RE.match(f.name) for f in child.iterdir())
            ),
            None,
        )
        if fim_dir is None:
            continue

        terrain = unit_root / "03_terrain" / f"{model_id}.tif"
        models.append(
            Model(
                model_id=model_id,
                name=model_name,
                output_dir=model_dir,
                fim_dir=fim_dir,
                profiles=_discover_profiles(fim_dir),
                reaches=_discover_reaches(unit_root, model_id, model_name),
                terrain_tif=terrain if terrain.is_file() else None,
                catalog=catalog.get(model_id, {}),
            )
        )
    return models


def read_unit(root: str | Path) -> Unit:
    """Describe the ras2fim output unit at ``root``.

    Raises :class:`SourceError` when the directory is not a unit or published no
    model with depth grids -- a unit with nothing to map is a build error, not an
    empty result, because every caller here exists to publish those grids.
    """
    root = Path(root)
    if not root.is_dir():
        raise SourceError(f"not a directory: {root}")

    match = UNIT_RE.match(root.name)
    if not match:
        raise SourceError(
            f"{root.name!r} is not a ras2fim unit name (expected <huc8>_<crs>_<source>_<yymmdd>)"
        )
    huc8, crs_number, source_code, process_date = match.groups()

    run_arguments = _read_run_arguments(root / "run_arguments.txt")
    catalog = _read_catalog(root / f"OWP_ras_models_catalog_{huc8}.csv")
    models = _discover_models(root, catalog)
    if not models:
        raise SourceError(f"no model with depth grids under {root / '05_hecras_output'}")

    return Unit(
        root=root,
        unit_name=root.name,
        huc8=huc8,
        crs=run_arguments.get("proj_crs") or f"EPSG:{crs_number}",
        source_code=source_code,
        process_date=process_date,
        run_arguments=run_arguments,
        models=models,
        vectors=_find_vectors(root),
        catalog=catalog,
    )


def _main() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("unit", help="ras2fim output unit directory")
    parser.add_argument("--report", help="write a machine-readable summary to this JSON path")
    args = parser.parse_args()

    unit = read_unit(args.unit)
    summary = {
        "unit": unit.unit_name,
        "huc8": unit.huc8,
        "crs": unit.crs,
        "source": unit.source_name,
        "model_unit": unit.model_unit,
        "models_cataloged": len(unit.catalog),
        "vectors": sorted(unit.vectors),
        "models": [
            {
                "model_id": m.model_id,
                "name": m.name,
                "slug": m.slug,
                "profiles": len(m.profiles),
                "profile_range": [m.profiles[0].index, m.profiles[-1].index] if m.profiles else [],
                "inundation_boundaries": sum(1 for p in m.profiles if p.inundation_shp),
                "reaches": [r.feature_id for r in m.reaches],
                "terrain": bool(m.terrain_tif),
            }
            for m in unit.models
        ],
    }

    if args.report:
        Path(args.report).write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"{summary['unit']}  HUC8 {summary['huc8']}  {summary['crs']}  {summary['source']}")
    print(f"  catalog: {summary['models_cataloged']} models, {len(summary['models'])} with a FIM library")
    print(f"  vectors: {', '.join(summary['vectors']) or 'none'}")
    for model in summary["models"]:
        print(
            f"  {model['model_id']} {model['name']}: {model['profiles']} profiles "
            f"{model['profile_range']}, reaches {model['reaches']}, "
            f"{model['inundation_boundaries']} inundation boundary"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
