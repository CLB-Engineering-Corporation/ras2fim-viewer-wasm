"""Check that everything the manifest advertises actually resolves.

The manifest is written by one process and read by another, weeks apart, over
HTTP. Most ways this breaks are silent in the browser: a COG that was never
built shows an empty map, a PMTiles layer renamed in the pipeline shows an empty
layer, and a depth maximum read off the overview pyramid clips the colour ramp
without any error anywhere. Each of those is a one-line check here.

Run it before every release, and after any pipeline change::

    python -m pipeline.fim1d.validate --frontend src/viewer-1d
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from osgeo import gdal

from ..common.geodesy import looks_like_lonlat
from . import cog_postprocess as cp

gdal.UseExceptions()


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []
        self.checks = 0

    def check(self, ok: bool, message: str) -> bool:
        self.checks += 1
        if not ok:
            self.failures.append(message)
        return ok

    def warn(self, ok: bool, message: str) -> None:
        self.checks += 1
        if not ok:
            self.warnings.append(message)


def validate_cogs(manifest: dict, frontend: Path, report: Report, deep: bool) -> None:
    for unit in manifest.get("units", []):
        for model in unit.get("models", []):
            fim = model["fim"]
            profiles = fim["profiles"]

            report.check(
                len(profiles) == fim["profile_count"],
                f"{model['slug']}: profile_count {fim['profile_count']} != {len(profiles)} listed",
            )
            indices = [p["index"] for p in profiles]
            report.check(
                indices == sorted(indices),
                f"{model['slug']}: profiles are not in ascending index order",
            )

            library_max = 0.0
            for entry in profiles:
                path = frontend / entry["cog"]
                if not report.check(path.is_file(), f"{model['slug']}: missing COG {entry['cog']}"):
                    continue
                report.check(
                    path.stat().st_size == entry["bytes"],
                    f"{entry['cog']}: size {path.stat().st_size} != manifest {entry['bytes']}",
                )
                library_max = max(library_max, float(entry["depth_max_ft"]))

                if deep:
                    result = cp.validate_cog(path, strict=False)
                    report.check(
                        result["ok"],
                        f"{entry['cog']}: not a valid COG -- {result['errors']}",
                    )
                    ds = gdal.Open(str(path))
                    band = ds.GetRasterBand(1)
                    # approx_ok=False: the approximate path reads the overview
                    # pyramid, whose area-matched cells hold the mean of their
                    # wet contributors and so under-report the peak.
                    _, exact_max = band.ComputeRasterMinMax(False)
                    method = ds.GetMetadataItem(f"{cp.METADATA_PREFIX}_OVERVIEW_METHOD")
                    tolerance = ds.GetMetadataItem(f"{cp.METADATA_PREFIX}_MAX_Z_ERROR")
                    ds = None
                    report.check(
                        method == "area_matched",
                        f"{entry['cog']}: overview method is {method!r}, not area_matched",
                    )
                    report.check(
                        tolerance is not None,
                        f"{entry['cog']}: no recorded LERC tolerance",
                    )
                    report.check(
                        abs(exact_max - float(entry["depth_max_ft"])) <= 0.05,
                        f"{entry['cog']}: raster max {exact_max:.3f} != manifest "
                        f"{entry['depth_max_ft']:.3f} ft",
                    )

            report.check(
                abs(library_max - float(fim["depth_max_ft"])) <= 0.05,
                f"{model['slug']}: depth_max_ft {fim['depth_max_ft']} != profile maximum "
                f"{library_max:.3f}. The colour ramp is built from this, so a low value "
                f"clips the deepest water on every profile.",
            )

            for reach in fim.get("reaches", []):
                report.check(
                    len(reach["profile_index"]) == len(profiles),
                    f"{model['slug']} reach {reach['feature_id']}: "
                    f"{len(reach['profile_index'])} curve points for {len(profiles)} profiles",
                )
                stages = [v for v in reach.get("stage_ft", []) if v is not None]
                # ras2fim itself flags non-monotonic reaches; this is reported
                # rather than failed, because it is a property of the model.
                report.warn(
                    all(b >= a for a, b in zip(stages, stages[1:])),
                    f"{model['slug']} reach {reach['feature_id']}: stage is not monotonic "
                    f"with profile index (ras2fim writes its own warning CSV for this)",
                )


def validate_vectors(manifest: dict, frontend: Path, report: Report) -> None:
    for unit in manifest.get("units", []):
        path = frontend / unit["pmtiles"]
        if not report.check(path.is_file(), f"{unit['unit']}: missing {unit['pmtiles']}"):
            continue
        ds = gdal.OpenEx(str(path), gdal.OF_VECTOR)
        if not report.check(ds is not None, f"{unit['pmtiles']}: GDAL cannot open it"):
            continue
        present = {ds.GetLayer(i).GetName() for i in range(ds.GetLayerCount())}
        ds = None
        # ras_model_extents is derived by the pipeline, so it is required
        # independently of what the source unit happened to publish.
        report.check(
            "ras_model_extents" in present,
            f"{unit['pmtiles']}: no ras_model_extents layer",
        )
        for name in unit.get("vector_layers", []):
            report.warn(
                name in present,
                f"{unit['pmtiles']}: manifest lists source layer {name!r} but the archive has "
                f"{sorted(present)}",
            )


def validate_bbox(manifest: dict, report: Report) -> None:
    for unit in manifest.get("units", []):
        bbox = unit.get("bbox")
        if not report.check(bool(bbox), f"{unit['unit']}: no bbox"):
            continue
        x0, y0, x1, y1 = bbox
        report.check(x0 < x1 and y0 < y1, f"{unit['unit']}: degenerate bbox {bbox}")
        report.check(
            -180 <= x0 <= 180 and -90 <= y0 <= 90,
            f"{unit['unit']}: bbox {bbox} is not WGS84 lon/lat -- a raster still in "
            f"projected units is the usual cause",
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--frontend", default="src/viewer-1d")
    parser.add_argument(
        "--deep",
        action="store_true",
        help="also open every COG and re-verify its layout, overview method, and exact maximum",
    )
    args = parser.parse_args(argv)

    frontend = Path(args.frontend)
    manifest_path = frontend / "manifest.json"
    if not manifest_path.is_file():
        print(f"FAIL  no manifest at {manifest_path}")
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = Report()
    validate_bbox(manifest, report)
    validate_vectors(manifest, frontend, report)
    validate_cogs(manifest, frontend, report, args.deep)

    for message in report.warnings:
        print(f"WARN  {message}")
    for message in report.failures:
        print(f"FAIL  {message}")

    verdict = "PASS" if not report.failures else "FAIL"
    print(
        f"\n{verdict}  {report.checks} checks, {len(report.failures)} failures, "
        f"{len(report.warnings)} warnings"
        + ("" if args.deep else "  (run with --deep to re-verify every COG)")
    )
    return 0 if not report.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
