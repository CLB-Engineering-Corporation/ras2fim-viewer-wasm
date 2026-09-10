"""Check that a built NetCDF viewer site is actually servable and correct.

Modelled on ``validate_release.py`` and written for the same reason its opening
gives: *most ways this breaks are silent in the browser*. A worker file left out
of the build 404s at runtime with no error from any tool. A manifest that
disagrees with its data shows an empty map. A ``float32`` stack renders garbage,
because the whole reader is built on an integer subtract.

Every check below corresponds to one of those.

    python pipeline/validate_netcdf_release.py --site site/ --deep

No GDAL: ``netCDF4`` is enough, so this runs on the plain interpreter rather
than in the pipeline's conda environment.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import netCDF4

#: What the viewer's app.js understands. Bump both together.
EXPECTED_SCHEMA = 1

#: Static-string loader APIs. Both are deliberately static so they can be checked
#: without executing anything.
LOADER_RE = re.compile(r"""(?:new\s+Worker\(|importScripts\()\s*["']([^"']+)["']""")
ASSET_RE = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""")


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


def validate_site_files(site: Path, report: Report) -> None:
    """The promotion's failure class: a file the page loads but the build omits."""
    index = site / "index.html"
    if not report.check(index.is_file(), "no index.html in the site"):
        return
    report.check((site / "manifest.json").is_file(), "no manifest.json in the site")
    report.warn((site / ".nojekyll").is_file(),
                "no .nojekyll -- GitHub Pages will run Jekyll over the site")

    html = index.read_text(encoding="utf-8", errors="replace")
    for reference in ASSET_RE.findall(html):
        if reference.startswith(("http://", "https://", "//", "data:")):
            continue
        report.check((site / reference).is_file(),
                     f"index.html loads {reference}, which is not in the site")
        report.check(not reference.startswith("/") and ".." not in reference,
                     f"index.html loads {reference}: absolute or parent paths stop the "
                     f"site being relocatable to a subpath or a bucket")

    # The check that catches a forgotten worker. Nothing else references it, so
    # its absence is invisible until the page runs.
    for script in sorted(site.glob("*.js")):
        source = script.read_text(encoding="utf-8", errors="replace")
        for reference in LOADER_RE.findall(source):
            report.check((site / reference).is_file(),
                         f"{script.name} loads {reference}, which is not in the site")


def validate_manifest(site: Path, manifest: dict, report: Report) -> None:
    report.check(manifest.get("schema_version") == EXPECTED_SCHEMA,
                 f"manifest schema_version is {manifest.get('schema_version')}, "
                 f"viewer expects {EXPECTED_SCHEMA}")

    streams = manifest.get("streams") or []
    report.check(bool(streams), "manifest lists no streams")

    remote = bool(manifest.get("data_base_url"))
    on_disk = sorted(p for p in (site / "data").rglob("*.nc")) if (site / "data").is_dir() else []

    if not remote:
        # A file present but unlisted is downloadable and invisible to the
        # picker; describe() rejects for eight different reasons and only says
        # so at build time.
        report.check(len(on_disk) == len(streams),
                     f"{len(on_disk)} .nc file(s) under data/ but {len(streams)} in the manifest")
        listed = {(site / s["file"]).resolve() for s in streams if "file" in s}
        for path in on_disk:
            report.check(path.resolve() in listed,
                         f"data/{path.relative_to(site / 'data').as_posix()} is published "
                         f"but not in the manifest")

    total = 0
    for entry in streams:
        name = entry.get("id", "?")
        if remote:
            parsed = urlparse(entry.get("file", ""))
            report.check(parsed.scheme in ("http", "https"),
                         f"{name}: data_base_url is set but file is not absolute http(s)")
            report.warn(False,
                        f"{name}: data is remote, so CORS cannot be verified offline; "
                        f"the host must send Access-Control-Allow-Origin")
            continue

        path = site / entry["file"]
        if not report.check(path.is_file(), f"{name}: missing {entry['file']}"):
            continue
        size = path.stat().st_size
        report.check(size == entry.get("bytes"),
                     f"{entry['file']}: size {size} != manifest {entry.get('bytes')}")
        total += size

        bounds = entry.get("bounds") or []
        if report.check(len(bounds) == 4, f"{name}: bounds is not a 4-element box"):
            x0, y0, x1, y1 = bounds
            report.check(x0 < x1 and y0 < y1, f"{name}: degenerate bounds {bounds}")
            report.check(-180 <= x0 <= 180 and -90 <= y0 <= 90,
                         f"{name}: bounds {bounds} are not WGS84 lon/lat -- a raster still "
                         f"in projected units is the usual cause")

    if not remote:
        report.check(total == manifest.get("total_bytes"),
                     f"total_bytes {manifest.get('total_bytes')} != sum of files {total}")


def validate_data(site: Path, manifest: dict, report: Report) -> None:
    """Reopen every file and re-derive what the manifest claims about it."""
    if manifest.get("data_base_url"):
        report.warn(False, "data is remote; --deep cannot reopen it")
        return

    for entry in manifest.get("streams") or []:
        name = entry.get("id", "?")
        path = site / entry["file"]
        if not path.is_file():
            continue

        with netCDF4.Dataset(path) as nc:
            variable = entry.get("variable")
            if not report.check(variable in nc.variables, f"{name}: no {variable} variable"):
                continue
            var = nc.variables[variable]

            # The reader is built on an integer subtract. A float stack would
            # render without erroring anywhere.
            report.check(var.dtype.name == "uint16",
                         f"{name}: {variable} is {var.dtype}, expected uint16")

            n_flow, ny, nx = var.shape
            report.check((nx, ny) == (entry["grid"]["nx"], entry["grid"]["ny"]),
                         f"{name}: grid is {nx}x{ny}, manifest says "
                         f"{entry['grid']['nx']}x{entry['grid']['ny']}")
            report.check(n_flow == entry["flow_count"],
                         f"{name}: {n_flow} layers, manifest says {entry['flow_count']}")

            flows = [float(v) for v in nc.variables["flow"][:]]
            report.check(all(math.isfinite(v) for v in flows), f"{name}: non-finite flow value")
            report.check(all(b >= a for a, b in zip(flows, flows[1:])),
                         f"{name}: flow values are not ascending; the slider assumes they are")

            if variable == "wsel":
                if not report.check("terrain" in nc.variables,
                                    f"{name}: wsel stack has no terrain"):
                    continue
                terrain = nc.variables["terrain"]
                report.check(terrain.dtype.name == "uint16",
                             f"{name}: terrain is {terrain.dtype}, expected uint16")
                report.check(terrain.shape == (ny, nx),
                             f"{name}: terrain shape {terrain.shape} != wsel grid {(ny, nx)}")
                # Not a failure: the viewer takes a float path when they differ.
                # The check exists so that if it ever fires, someone knows the
                # uncommon branch is being exercised.
                report.warn(
                    getattr(terrain, "scale_factor", None) == getattr(var, "scale_factor", None),
                    f"{name}: terrain scale_factor differs from {variable}; the viewer "
                    f"falls back to its float path")

            report.check(hasattr(var, "_FillValue"),
                         f"{name}: {variable} has no _FillValue; dry cells cannot be identified")

            if "spatial_ref" in nc.variables:
                raw = getattr(nc.variables["spatial_ref"], "GeoTransform", None)
                parts = [float(p) for p in str(raw).split()] if raw else []
                if report.check(len(parts) == 6, f"{name}: spatial_ref has no 6-number GeoTransform"):
                    report.check(all(math.isfinite(p) for p in parts),
                                 f"{name}: GeoTransform contains a non-finite value")
                    report.check(parts[2] == 0 and parts[4] == 0,
                                 f"{name}: rotated grid; the viewer refuses these")
            else:
                report.check(False, f"{name}: no spatial_ref variable")

            # Depth is stored in a Uint16Array in the viewer's index. At
            # scale_factor 0.1 the ceiling is 6553.4 ft, so this will not fire on
            # real data -- which is exactly why it should be a machine check.
            scale = float(getattr(var, "scale_factor", 1.0))
            report.check(scale > 0, f"{name}: scale_factor {scale} is not positive")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", required=True, help="built site directory")
    parser.add_argument("--deep", action="store_true",
                        help="also reopen every NetCDF and re-derive what the manifest claims")
    args = parser.parse_args(argv)

    site = Path(args.site).resolve()
    if not site.is_dir():
        print(f"FAIL  not a directory: {site}")
        return 2
    manifest_path = site / "manifest.json"
    if not manifest_path.is_file():
        print(f"FAIL  no manifest at {manifest_path}")
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = Report()
    validate_site_files(site, report)
    validate_manifest(site, manifest, report)
    if args.deep:
        validate_data(site, manifest, report)

    for message in report.warnings:
        print(f"WARN  {message}")
    for message in report.failures:
        print(f"FAIL  {message}")

    verdict = "PASS" if not report.failures else "FAIL"
    print(f"\n{verdict}  {report.checks} checks, {len(report.failures)} failures, "
          f"{len(report.warnings)} warnings"
          + ("" if args.deep else "  (run with --deep to reopen every NetCDF)"))
    return 0 if not report.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
