"""Turn a directory of ras2fim-2d NetCDF into a self-contained static site.

The output is a folder you can drop on GitHub Pages, S3 static hosting, or any
plain web server. There is no tile server, no database, and no build step at
serve time -- the browser opens the ``.nc`` files directly.

    python pipeline/build_netcdf_site.py <dir-of-nc> --out site/

What you get::

    site/
      index.html  app.js  netcdf.js   the viewer
      vendor/                          h5wasm + MapLibre
      data/                            the .nc files, byte-for-byte
      manifest.json                    which streams exist and where

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
import shutil
import subprocess
import sys
from pathlib import Path

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


def build(
    source: Path,
    out: Path,
    *,
    viewer_root: str | None = None,
    title: str,
    attribution: str | None,
    data_base_url: str | None,
    clean: bool,
) -> int:
    viewer = _viewer_root(viewer_root)
    vendor = _ensure_vendor(viewer)

    if clean and out.exists():
        shutil.rmtree(out)
    (out / "vendor").mkdir(parents=True, exist_ok=True)
    data_dir = out / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    for name in VIEWER_FILES:
        shutil.copy2(viewer / name, out / name)
    for name in VENDOR_FILES:
        shutil.copy2(vendor / name, out / "vendor" / name)
    print(f"  viewer: {len(VIEWER_FILES)} files, vendor: {len(VENDOR_FILES)} files")

    copied = 0
    for path in sorted(source.rglob("*.nc")):
        # Published exactly as ras2fim-2d wrote them -- no repacking, no
        # conversion. That is the whole point: the browser reads the native file.
        shutil.copy2(path, data_dir / path.name)
        copied += 1
    if not copied:
        raise SystemExit(f"FAIL  no .nc files under {source}")
    print(f"  data:   {copied} NetCDF file(s)")

    catalog = manifest_builder.build(data_dir, out, title, attribution)
    if not catalog["streams"]:
        raise SystemExit("FAIL  none of the copied files is a ras2fim-2d stack")

    if data_base_url:
        # Absolute URLs for a cross-origin data host. The bucket must send CORS.
        base = data_base_url.rstrip("/")
        for entry in catalog["streams"]:
            entry["file"] = f"{base}/{Path(entry['file']).name}"
        catalog["data_base_url"] = base
        shutil.rmtree(data_dir)
        print(f"  data:   rewritten to {base} (remote host must send CORS headers)")

    import json

    (out / "manifest.json").write_text(json.dumps(catalog, indent=1), encoding="utf-8")

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
    parser.add_argument("--clean", action="store_true", help="remove the output directory first")
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
