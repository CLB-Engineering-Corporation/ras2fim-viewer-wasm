"""Assemble a publishable, self-contained 1D dashboard.

The 1D viewer normally draws depth through TiTiler, which is right for a private
deployment carrying many units and impossible for static hosting. When every
profile has been baked by ``pipeline.fim1d.depth_pmtiles``, the release needs no
tile service at all and can be published anywhere that serves files with HTTP
byte ranges -- GitHub Pages included.

This module builds that release. It is the 1D counterpart of
``pipeline.fim2d.site`` and follows the same rules for the same reasons:

* Select and validate the whole inventory **before** anything is copied, so a
  release never contains a file the manifest does not list, or list one it does
  not contain.
* Build into staging and replace at the end, so a rebuild after an input was
  removed does not leave the stale copy behind for the manifest to pick up.
* Refuse any layout where the output overlaps an input, because the output
  directory is deleted and rebuilt.

The COGs are deliberately **not** published. They are the source the tiles were
baked from; without a tile service they are 4.3 MB no browser can read. The
manifest is rewritten to stop naming them, because a manifest that points at
files a release does not carry is a broken contract, not a harmless leftover.

Usage::

    python -m pipeline.fim1d.site src/viewer-1d --out site-1d/
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

#: Every file the page loads. Miss one and the build succeeds while the
#: deployed site fails in a browser. fim1d/validate.py scans the shipped HTML
#: and JS for references and checks them against this list.
VIEWER_FILES = ("index.html", "app.js", "styles.css")

#: config.js is NOT copied -- it is generated, because the one thing that must
#: differ between a local preview and a publication is the tile service, and a
#: published page carrying a developer's `localhost:8102` is both useless and
#: sloppy.
GENERATED_FILES = ("config.js",)

VENDOR_FILES = ("maplibre-gl.js", "maplibre-gl.css", "pmtiles.js")
VENDOR_DIRS = ("fonts",)


def _repo_root() -> Path:
    """The repository root, two levels up from pipeline/fim1d/."""
    return Path(__file__).resolve().parent.parent.parent


class SiteError(RuntimeError):
    """The release cannot be built as asked."""


def _assert_safe_layout(source: Path, out: Path) -> None:
    """Refuse any layout in which building would destroy its own inputs."""
    source, out = source.resolve(), out.resolve()

    def contains(parent: Path, child: Path) -> bool:
        return parent == child or parent in child.parents

    if contains(out, source) or contains(source, out):
        raise SiteError(
            f"--out and the source viewer overlap:\n"
            f"        source {source}\n"
            f"        out    {out}\n"
            f"      The output is deleted and rebuilt, which would destroy the input.")
    if out.parent == out:
        raise SiteError(f"refusing to use a filesystem root as --out: {out}")


def _load_manifest(source: Path) -> dict:
    path = source / "manifest.json"
    if not path.is_file():
        raise SiteError(
            f"no manifest.json in {source}. Run pipeline.fim1d.manifest first.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SiteError(f"manifest.json is not valid JSON: {error}") from None


def select_inventory(source: Path, manifest: dict, *, require_baked: bool) -> list[Path]:
    """Every file the release must carry, as paths relative to ``source``.

    Validates before anything moves. ``require_baked`` is the difference between
    a release that stands alone and one that silently depends on a tile service
    the host cannot run.
    """
    wanted: list[Path] = []
    missing: list[str] = []
    unbaked: list[str] = []

    for unit in manifest.get("units", []):
        vectors = unit.get("pmtiles")
        if vectors:
            wanted.append(Path(vectors))
        for model in unit.get("models", []):
            fim = model.get("fim") or {}
            for profile in fim.get("profiles", []):
                baked = profile.get("depth_pmtiles")
                if baked:
                    wanted.append(Path(baked))
                else:
                    unbaked.append(f"{model.get('slug', '?')} profile {profile.get('index')}")

    if require_baked and unbaked:
        raise SiteError(
            f"{len(unbaked)} profile(s) have no baked depth tiles, so this release would "
            f"need a tile service that static hosting cannot provide.\n"
            f"        first: {unbaked[0]}\n"
            f"      Run `python -m pipeline.fim1d.depth_pmtiles {source}` first, "
            f"or pass --allow-tile-service if the target really does run TiTiler.")

    for relative in wanted:
        if not (source / relative).is_file():
            missing.append(relative.as_posix())
    if missing:
        raise SiteError(
            f"the manifest names {len(missing)} file(s) that are not present:\n"
            + "\n".join(f"        {m}" for m in missing[:5]))
    if not wanted:
        raise SiteError(f"the manifest under {source} lists nothing to publish")
    return wanted


def _publishable_manifest(manifest: dict, *, drop_cogs: bool) -> dict:
    """The manifest as published: it must describe what the release contains.

    A published manifest that still names ``cog`` paths would advertise 4.3 MB
    of GeoTIFF the release does not carry and no browser could read anyway.
    """
    published = json.loads(json.dumps(manifest))
    published["depth_delivery"] = "pmtiles" if drop_cogs else "mixed"
    published["published_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not drop_cogs:
        return published
    for unit in published.get("units", []):
        for model in unit.get("models", []):
            for profile in (model.get("fim") or {}).get("profiles", []):
                profile.pop("cog", None)
                profile.pop("bytes", None)
    return published


def _generated_config(manifest: dict, *, self_contained: bool,
                      raster_tile_base: str | None) -> str:
    """config.js for the published release.

    Generated rather than copied so a publication cannot inherit a developer's
    loopback tile server, and so the initial view comes from the data.
    """
    bbox = manifest.get("bbox")
    if bbox and len(bbox) == 4:
        centre = [round((bbox[0] + bbox[2]) / 2, 5), round((bbox[1] + bbox[3]) / 2, 5)]
    else:
        centre = [-97.23, 30.09]

    base = "null" if self_contained else json.dumps(raster_tile_base or "")
    note = (
        "   Every profile in this release was baked into a static PMTiles archive,\n"
        "   so there is no tile service to point at and this stays null."
        if self_contained else
        "   This release still needs a tile service for at least one profile."
    )
    return f"""/* Generated by pipeline/fim1d/site.py -- do not edit by hand.

   Per-deployment settings for a published release.

{note} */
window.FIMCFG = {{
  manifest: "manifest.json",
  rasterTileBase: {base},
  initialCenter: {json.dumps(centre)},
  initialZoom: 9.5
}};
"""


def build(source: Path, out: Path, *, require_baked: bool = True,
          raster_tile_base: str | None = None, verbose: bool = True) -> dict:
    """Build the release. Returns a report."""
    source, out = source.resolve(), out.resolve()
    if not source.is_dir():
        raise SiteError(f"source is not a directory: {source}")
    _assert_safe_layout(source, out)

    manifest = _load_manifest(source)
    inventory = select_inventory(source, manifest, require_baked=require_baked)

    for name in VIEWER_FILES:
        if not (source / name).is_file():
            raise SiteError(f"viewer source incomplete at {source}: missing {name}")
    vendor = source / "vendor"
    for name in VENDOR_FILES:
        if not (vendor / name).is_file():
            raise SiteError(f"{vendor} is missing {name}; run src/viewer-1d's vendor fetch")

    self_contained = require_baked or all(
        profile.get("depth_pmtiles")
        for unit in manifest.get("units", [])
        for model in unit.get("models", [])
        for profile in (model.get("fim") or {}).get("profiles", []))

    staging = out.parent / f".{out.name}.staging-{os.getpid()}"
    if staging.exists():
        shutil.rmtree(staging)
    try:
        staging.mkdir(parents=True)
        for name in VIEWER_FILES:
            shutil.copy2(source / name, staging / name)
        (staging / "vendor").mkdir(parents=True, exist_ok=True)
        for name in VENDOR_FILES:
            shutil.copy2(vendor / name, staging / "vendor" / name)
        for name in VENDOR_DIRS:
            if (vendor / name).is_dir():
                shutil.copytree(vendor / name, staging / "vendor" / name)

        total = 0
        for relative in inventory:
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / relative, target)
            total += target.stat().st_size

        (staging / "config.js").write_text(
            _generated_config(manifest, self_contained=self_contained,
                              raster_tile_base=raster_tile_base),
            encoding="utf-8")
        (staging / "manifest.json").write_text(
            json.dumps(_publishable_manifest(manifest, drop_cogs=self_contained), indent=1),
            encoding="utf-8")
        # Jekyll would otherwise process the site and can mangle or drop assets.
        (staging / ".nojekyll").write_text("", encoding="utf-8")

        if out.exists():
            shutil.rmtree(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        staging.replace(out)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)

    site_bytes = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    report = {
        "out": str(out),
        "self_contained": self_contained,
        "data_files": len(inventory),
        "data_bytes": total,
        "site_bytes": site_bytes,
    }
    if verbose:
        print(f"  {out}")
        print(f"    {len(inventory)} data file(s), site total {site_bytes / 1048576:.1f} MB")
        print(f"    depth delivery: {'baked PMTiles, no tile service' if self_contained else 'tile service required'}")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="the 1D viewer root (e.g. src/viewer-1d)")
    parser.add_argument("--out", required=True, help="directory to build the release into")
    parser.add_argument("--allow-tile-service", action="store_true",
                        help="publish even though some profiles still need TiTiler")
    parser.add_argument("--raster-tile-base",
                        help="tile service URL to write into config.js, with --allow-tile-service")
    parser.add_argument("--report", help="write a JSON build report here")
    args = parser.parse_args(argv)

    try:
        report = build(Path(args.source), Path(args.out),
                       require_baked=not args.allow_tile_service,
                       raster_tile_base=args.raster_tile_base)
    except SiteError as error:
        print(f"FAIL  {error}", file=sys.stderr)
        return 2

    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"    report: {args.report}")
    print(f"\n  Serve it:  python -m serve.range_server 8110 {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
