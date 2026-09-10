"""Turn a directory of ras2fim-2d NetCDF into a self-contained static site.

The output is a folder you can drop on GitHub Pages, S3 static hosting, or any
plain web server. There is no tile server, no database, and no build step at
serve time -- the browser opens the ``.nc`` files directly.

    python pipeline/build_netcdf_site.py <dir-of-nc> --out site/

What you get::

    site/
      index.html  app.js  netcdf.js   the viewer
      vendor/                          h5wasm + MapLibre
      data/                            the .nc files, byte-for-byte,
                                       keeping their source-relative paths
      manifest.json                    which streams exist and where
      .nojekyll                        keeps GitHub Pages from processing the site

Hosting notes that are easy to learn the hard way:

* **Same origin is the simple case.** If the ``.nc`` files end up on a
  different origin than the page -- say the site on GitHub Pages and the data
  in S3 -- the bucket must send ``Access-Control-Allow-Origin``. S3 does not do
  that by default even for fully public buckets, and the failure is a blocked
  fetch, not a helpful error. ``--data-base-url`` exists for that case, and it
  is on you to configure CORS on the bucket.
* **No special headers otherwise.** h5wasm here is a single self-contained
  ``.js`` with the wasm embedded, so there is no ``application/wasm`` MIME type
  to configure and no COOP/COEP requirement.
* **Whole files are fetched.** Fine at a few megabytes per stream, which is
  what ras2fim-2d produces; this is not a design for one enormous NetCDF.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_netcdf_manifest as manifest_builder  # noqa: E402

VIEWER_FILES = ("index.html", "app.js", "netcdf.js")
VENDOR_FILES = ("h5wasm.js", "maplibre-gl.js", "maplibre-gl.css")


def _viewer_root(explicit: str | None) -> Path:
    root = Path(explicit) if explicit else Path(__file__).resolve().parent.parent / "prototypes" / "netcdf-2d"
    missing = [f for f in VIEWER_FILES if not (root / f).is_file()]
    if missing:
        raise SystemExit(f"FAIL  viewer source incomplete at {root}: missing {', '.join(missing)}")
    return root


def _ensure_vendor(viewer: Path) -> Path:
    """Vendor libraries are pinned, not committed; fetch them if absent."""
    vendor = viewer / "vendor"
    missing = [f for f in VENDOR_FILES if not (vendor / f).is_file()]
    if not missing:
        return vendor

    script = viewer / "fetch-vendor.sh"
    if not script.is_file():
        raise SystemExit(f"FAIL  {vendor} is missing {', '.join(missing)} and there is no fetch-vendor.sh")
    print(f"  vendor: fetching {', '.join(missing)}")
    subprocess.run(["bash", str(script)], check=True)

    still_missing = [f for f in VENDOR_FILES if not (vendor / f).is_file()]
    if still_missing:
        raise SystemExit(f"FAIL  fetch-vendor.sh did not produce {', '.join(still_missing)}")
    return vendor


def _assert_safe_layout(source: Path, out: Path, viewer: Path, vendor: Path) -> None:
    """Refuse any layout in which building would destroy its own inputs.

    The output directory is deleted and replaced. Without this check,
    ``--out`` pointing at the source, at the viewer, or at any ancestor of
    either quietly deletes the thing being published -- and an output nested
    *inside* the source also contaminates the next recursive scan with its own
    previous results.
    """
    source, out = source.resolve(), out.resolve()
    viewer, vendor = viewer.resolve(), vendor.resolve()

    def contains(parent: Path, child: Path) -> bool:
        return parent == child or parent in child.parents

    if contains(out, source) or contains(source, out):
        raise SystemExit(
            f"FAIL  --out and the source directory overlap:\n"
            f"        source {source}\n"
            f"        out    {out}\n"
            f"      The output is deleted and rebuilt, which would destroy the input."
        )
    for label, path in (("viewer", viewer), ("vendor", vendor)):
        if contains(out, path):
            raise SystemExit(
                f"FAIL  --out {out} contains the {label} directory {path}; "
                f"rebuilding would delete it."
            )
    if out.parent == out:
        raise SystemExit(f"FAIL  refusing to use a filesystem root as --out: {out}")


def _select_inventory(source: Path) -> list[tuple[Path, PurePosixPath]]:
    """Every publishable NetCDF under ``source``, validated before anything moves.

    Returns ``(absolute path, path relative to source)``. The relative path is
    what keeps two models that happen to share a filename from collapsing into
    one stream: a flat ``data/<basename>`` layout loses one of them silently,
    with no error and no missing-file to notice later.
    """
    candidates = sorted(source.rglob("*.nc"))
    if not candidates:
        raise SystemExit(f"FAIL  no .nc files under {source}")

    inventory: list[tuple[Path, PurePosixPath]] = []
    rejected: list[str] = []
    # Distinct source paths can legitimately describe the same stream id -- the
    # same reach in two scenarios -- so a repeat is reported, not fatal.
    seen: dict[str, PurePosixPath] = {}

    for path in candidates:
        relative = PurePosixPath(path.relative_to(source).as_posix())
        try:
            described = manifest_builder.describe(path, source)
        except (OSError, RuntimeError) as error:
            rejected.append(f"{relative}: {error}")
            continue
        if described is None:
            rejected.append(f"{relative}: not a ras2fim-2d wsel/depth stack")
            continue

        stream_id = str(described["id"])
        if stream_id in seen:
            print(f"  note  stream id {stream_id!r} appears twice: {seen[stream_id]} and {relative}")
        else:
            seen[stream_id] = relative
        inventory.append((path, relative))

    for message in rejected:
        print(f"  skip  {message}")
    if not inventory:
        raise SystemExit(f"FAIL  no file under {source} is a ras2fim-2d stack")
    return inventory


def build(
    source: Path,
    out: Path,
    *,
    viewer_root: str | None = None,
    title: str,
    attribution: str | None,
    data_base_url: str | None,
    clean: bool = False,  # noqa: ARG001 - accepted and ignored; see main()
) -> int:
    viewer = _viewer_root(viewer_root)
    vendor = _ensure_vendor(viewer)
    _assert_safe_layout(source, out, viewer, vendor)

    # Select and validate the publishable inventory BEFORE anything is copied.
    # Deciding what to publish only after copying means a file the manifest
    # rejects is still sitting in the output, publicly downloadable and invisible
    # to the picker -- present but unlisted, which is the worst of both.
    inventory = _select_inventory(source)

    # Build into staging and replace at the end. Writing into the output
    # directory in place means a rebuild after an input is removed leaves the
    # stale copy behind, and the manifest picks it straight back up.
    staging = out.parent / f".{out.name}.staging-{os.getpid()}"
    if staging.exists():
        shutil.rmtree(staging)
    try:
        (staging / "vendor").mkdir(parents=True, exist_ok=True)
        data_dir = staging / "data"
        data_dir.mkdir(parents=True, exist_ok=True)

        for name in VIEWER_FILES:
            shutil.copy2(viewer / name, staging / name)
        for name in VENDOR_FILES:
            shutil.copy2(vendor / name, staging / "vendor" / name)
        # Jekyll would otherwise process the site and can mangle or drop assets.
        (staging / ".nojekyll").write_text("", encoding="utf-8")
        print(f"  viewer: {len(VIEWER_FILES)} files, vendor: {len(VENDOR_FILES)} files")

        for path, relative in inventory:
            # Published exactly as ras2fim-2d wrote them -- no repacking, no
            # conversion. The source-relative path is preserved, so two models
            # holding the same filename stay two distinct streams.
            target = data_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        print(f"  data:   {len(inventory)} NetCDF file(s)")

        catalog = manifest_builder.build(data_dir, staging, title, attribution)
        if len(catalog["streams"]) != len(inventory):
            # _select_inventory already validated every file, so a mismatch here
            # means the two code paths disagree -- publishing anyway would ship a
            # silently incomplete catalog.
            raise SystemExit(
                f"FAIL  {len(inventory)} file(s) selected but {len(catalog['streams'])} "
                f"in the manifest; inventory and manifest disagree"
            )

        if data_base_url:
            # Absolute URLs for a cross-origin data host. The bucket must send CORS.
            base = data_base_url.rstrip("/")
            for entry in catalog["streams"]:
                # Keep the directory structure and percent-encode each segment;
                # taking only the basename here would silently merge the same
                # collisions the copy step just preserved.
                relative = PurePosixPath(entry["file"]).relative_to("data")
                encoded = "/".join(quote(part) for part in relative.parts)
                entry["file"] = f"{base}/{encoded}"
            catalog["data_base_url"] = base
            shutil.rmtree(data_dir)
            print(f"  data:   rewritten to {base} (remote host must send CORS headers)")

        (staging / "manifest.json").write_text(
            json.dumps(catalog, indent=1, allow_nan=False), encoding="utf-8"
        )

        if out.exists():
            shutil.rmtree(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        staging.replace(out)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)

    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"\n{out}")
    print(f"  {len(catalog['streams'])} stream(s), site total {total / 1e6:.1f} MB")
    for entry in catalog["streams"]:
        print(f"    {entry['id']:<16} {entry['flow_count']:>3} flows  {entry['bytes'] / 1e6:5.2f} MB")
    print(f"\n  Serve it:  python serve/range_server.py 8120 {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="directory containing ras2fim-2d .nc output")
    parser.add_argument("--out", required=True, help="site output directory")
    parser.add_argument("--viewer", help="viewer source dir (default: prototypes/netcdf-2d)")
    parser.add_argument("--title", default="ras2fim-2d flood inundation")
    parser.add_argument("--attribution", help="credit for whoever produced the model output")
    parser.add_argument(
        "--data-base-url",
        help="host the .nc files elsewhere (e.g. an S3 bucket) instead of copying them "
        "into the site. That bucket must send Access-Control-Allow-Origin.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="accepted for compatibility and ignored: the site is always built in "
        "staging and swapped in, so the output never carries files from a previous run",
    )
    args = parser.parse_args(argv)

    source = Path(args.source).resolve()
    if not source.is_dir():
        parser.error(f"not a directory: {source}")

    return build(
        source,
        Path(args.out).resolve(),
        viewer_root=args.viewer,
        title=args.title,
        attribution=args.attribution,
        data_base_url=args.data_base_url,
        clean=args.clean,
    )


if __name__ == "__main__":
    raise SystemExit(main())
