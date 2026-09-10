"""Check that everything the manifest advertises actually resolves.

The manifest is written by one process and read by another, weeks apart, over
HTTP. Most ways this breaks are silent in the browser: a COG that was never
built shows an empty map, a PMTiles layer renamed in the pipeline shows an empty
layer, and a depth maximum read off the overview pyramid clips the colour ramp
without any error anywhere. Each of those is a one-line check here.

Run it before every release, and after any pipeline change::

    python -m pipeline.fim1d.validate src/viewer-1d
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ..common.geodesy import looks_like_lonlat


def _gdal():
    """Import GDAL only when a check actually needs it.

    A published release carries baked tiles and no COGs, and validating one is
    exactly the thing you want to do on the machine that will host it -- which
    is unlikely to have the GDAL Python bindings. Importing at module scope made
    that impossible for no reason: only the deep COG checks touch GDAL.
    """
    from osgeo import gdal

    gdal.UseExceptions()
    return gdal


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


#: PMTiles v3 fixed-header offsets, read off a real archive rather than from
#: memory -- the tile type is byte 99, not 17, and getting it wrong makes this
#: check pass on anything. Checking the header is cheap and catches the two
#: failures that actually happen: a truncated copy, and a vector archive written
#: where a raster one was meant.
PMTILES_MAGIC = b"PMTiles"
PMTILES_HEADER_BYTES = 127
PMTILES_OFF_VERSION = 7
PMTILES_OFF_TILE_TYPE = 99
PMTILES_OFF_MIN_ZOOM = 100
PMTILES_OFF_MAX_ZOOM = 101
PMTILES_TILETYPE_PNG = 2
PMTILES_TILETYPE_MVT = 1


def _validate_pmtiles_archive(path: Path, label: str, report: Report, *,
                              expect_tile_type: int = PMTILES_TILETYPE_PNG) -> None:
    """Header-level checks on a PMTiles archive."""
    with path.open("rb") as handle:
        header = handle.read(PMTILES_HEADER_BYTES)
    if not report.check(len(header) == PMTILES_HEADER_BYTES and header[:7] == PMTILES_MAGIC,
                        f"{label}: not a PMTiles archive"):
        return
    version = header[PMTILES_OFF_VERSION]
    report.check(version == 3, f"{label}: PMTiles spec version {version}, expected 3")
    tile_type = header[PMTILES_OFF_TILE_TYPE]
    report.check(
        tile_type == expect_tile_type,
        f"{label}: tile type {tile_type}, expected {expect_tile_type}. "
        f"The wrong kind of archive loads without error and draws nothing.",
    )
    min_zoom = header[PMTILES_OFF_MIN_ZOOM]
    max_zoom = header[PMTILES_OFF_MAX_ZOOM]
    report.check(
        max_zoom >= min_zoom,
        f"{label}: max zoom {max_zoom} is below min zoom {min_zoom}",
    )
    # Overzooming a base tile is fine and honest -- the cells really are ~8 m --
    # but an archive that stops far short of native resolution is a build error.
    if expect_tile_type == PMTILES_TILETYPE_PNG:
        report.warn(
            max_zoom >= 12,
            f"{label}: base zoom is only {max_zoom}; the depth grid will look coarse",
        )


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
                library_max = max(library_max, float(entry["depth_max_ft"]))

                # A published release carries baked tiles and no COGs, so a
                # profile without a "cog" key is correct rather than broken --
                # but only if it has the tiles that replaced it. Silence here
                # would let a release ship with neither.
                baked = entry.get("depth_pmtiles")
                if baked:
                    tiles = frontend / baked
                    if report.check(tiles.is_file(),
                                    f"{model['slug']}: missing depth tiles {baked}"):
                        report.check(
                            tiles.stat().st_size == entry.get("depth_pmtiles_bytes"),
                            f"{baked}: size {tiles.stat().st_size} != manifest "
                            f"{entry.get('depth_pmtiles_bytes')}",
                        )
                        if deep:
                            _validate_pmtiles_archive(tiles, baked, report)

                if "cog" not in entry:
                    report.check(
                        bool(baked),
                        f"{model['slug']} profile {entry['index']}: has neither a COG nor "
                        f"baked depth tiles, so nothing can draw it",
                    )
                    continue

                path = frontend / entry["cog"]
                if not report.check(path.is_file(), f"{model['slug']}: missing COG {entry['cog']}"):
                    continue
                report.check(
                    path.stat().st_size == entry["bytes"],
                    f"{entry['cog']}: size {path.stat().st_size} != manifest {entry['bytes']}",
                )

                if deep:
                    from . import cog_postprocess as cp

                    gdal = _gdal()
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
        # Without GDAL the layer names cannot be read, but the archive can still
        # be checked for what actually goes wrong with it -- truncation, and a
        # raster archive written where a vector one belongs. That keeps a
        # published release validatable on the host that will serve it.
        try:
            gdal = _gdal()
        except ImportError:
            _validate_pmtiles_archive(path, unit["pmtiles"], report,
                                      expect_tile_type=PMTILES_TILETYPE_MVT)
            report.warn(False, f"{unit['pmtiles']}: layer names not checked (GDAL unavailable)")
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
    parser.add_argument("source", nargs="?", default="src/viewer-1d",
                        help="the 1D viewer root or a built release")
    parser.add_argument(
        "--deep",
        action="store_true",
        help="also open every COG and re-verify its layout, overview method, and exact maximum",
    )
    parser.add_argument("--report", help="write the findings to this JSON path")
    args = parser.parse_args(argv)

    frontend = Path(args.source)
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
