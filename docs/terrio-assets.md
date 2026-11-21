# Pinned Terrio assets and reference controls

The default site uses `terrio-slices`, selected through the catalog. It requires
the complete nine-asset package in `pipeline/common/terrio-assets.lock.json`:
Terrio 0.9.0, source `7f1996f972645c7d4b71822702b9fc331ad36df9` (CLB fork branch
`reconcile/upstream-80c9e7a`, fork PR #45), WASM SHA256
`1619b0d88ac83d6a672e7824694e7b07c3668029aa333165c78092464e713147`
(15,056,333 bytes). Both declarations, package metadata, three license/notice
files and the one wasm-bindgen snippet are locked. Snippets must be included and
inventoried when generated: this build has
`snippets/terrio-js-45694ff93a19545f/inline0.js`, imported by `terrio.js`, and
`fim2d.validate` fails a site whose Terrio package lacks any module `terrio.js`
imports.

Acquire the candidate from the authenticated CLB draft as described in
[terrio-release-artifacts.md](terrio-release-artifacts.md). The archive digest is
committed separately in `pipeline/common/terrio-release.lock.json`. A fresh CI
runner downloads/verifies it, imports the cache and builds/validates a default
site; default asset validation is required by all-green. Draft visibility uses
an ephemeral contents-write token in that dedicated job only; no persistent OAuth
credential is copied into repository secrets. Exactly the jobs that download draft
assets hold that token -- `assets` and `native` in tests.yml and the session job in
safari-acceptance.yml; every other job is read-only, and fork PRs get GitHub's
read-only cap.

```sh
python scripts/terrio_release_assets.py acquire --sha256 c0dcfdf5cecc05df19636caf25f785b1c9a3ba7aeeddfc0f4d384afdcf5fd00c --destination .terrio-validation/runtime
python -m pipeline.fim2d.site <nc-directory> --out <site-directory>
python -m pipeline.fim2d.validate <site-directory> --deep
```

For an already acquired offline web package, import it using
`python -m pipeline.common.terrio_assets --package <web-package>`.
`TERRIO_ASSET_CACHE` overrides the cache root (default `~/.cache/ras2fim-terrio`);
the immutable source commit names the package directory. Imports verify before
staging/renaming and refuse to overwrite a corrupt existing cache. Quarantine
corrupt caches explicitly before retrying. Every default build verifies again.
Missing or altered assets stop the build before output replacement. No binary is
committed, no network retry changes the selected decoder, and no fallback is silent.

`--reader-backend h5wasm` builds an explicit reference site and omits Terrio assets.
In a Terrio site, `?decoder=h5wasm` selects the shipped reference runtime.
`--terrio-package PATH` permits local development overrides, inventories all
bytes/licenses and marks the provenance/catalog `local-override`; it does not
claim reviewed lock identity. Unknown backend names fail. `?verify=1` compares
prepared layers with the dense renderer. Whole-file input still downloads before
bounded flow decoding; this is not scientific HTTP range access.

## Native publication artifacts

`pipeline.fim1d.depth_pmtiles` and `pipeline.fim1d.cogs` default to Terrio and
need the reviewed native runtime for the interpreter's platform. One wheel per
platform, both version `0.9.0+clb7f1996f.1`, both from Terrio source
`7f1996f972645c7d4b71822702b9fc331ad36df9`, neither on PyPI. Since 0.9.0 the
reviewed platforms are **Windows AMD64 and Linux x86_64 only** (maintainer
decision, 2026-11-21); Linux arm64 and macOS, which had wheels for the previous
runtime, have none and fail closed like any unreviewed platform:

| Lock key | Wheel | SHA256 |
|---|---|---|
| `win_amd64` | `terrio-0.9.0+clb7f1996f.1-cp310-abi3-win_amd64.whl` | `a27f001339c1015dbf0009f9a960c592ded643db2a04737a1a761410037fe938` |
| `linux_x86_64` | `terrio-0.9.0+clb7f1996f.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | `9ee1b1a0d33bee1dd43e28e5e5b26aa99383def3b5e190bc3306b5b6dec4387b` |

```sh
python scripts/terrio_release_assets.py wheel --destination <new-dir>   # this interpreter's platform
python -m pip install --no-deps <new-dir>/terrio-*.whl                 # then numpy, affine
```

The acquirer downloads the exact committed filename and refuses any byte that
does not match `pipeline/common/terrio-release.lock.json`. Install into a
dedicated environment with GDAL >= 3.8 (conda-forge works on every platform;
CI uses GDAL 3.13.3). Linux arm64, macOS, musllinux, Windows ARM64 and other
platforms have no reviewed artifact: use the explicit GDAL controls there.

`pipeline/common/terrio-python.lock.json` (schema 2) holds one Python inventory
and one native extension per platform (`_terrio.pyd` on Windows,
`_terrio.abi3.so` on Linux). The 55 Python files are byte-identical on both
platforms -- they are the `7f1996f` blobs as a `core.autocrlf=true` checkout
writes them (CRLF), which is what both artifacts were built from.
`require_terrio()` selects the entry for `sys.platform`/`platform.machine()`,
checks every locked Python file and the actual loaded extension, refuses a
competing ABI-qualified extension or another platform's artifact, and fails
closed on an unreviewed platform. Missing/DLL/ABI import failures name the
explicit `--writer-backend gdal` and `--backend gdal` controls.
`platform_view()` reproduces the exact schema-1 inventory each wheel embeds as
`terrio-source.json`; for `win_amd64` it is byte for byte the object the
Windows wheel and runtime bundle were made from.

### How the wheels were built

Both are Cargo dev-profile builds (`debug = 0`, openjp2 optimized), like for
like with the previous runtime's, not Terrio's upstream release or `wheel`
profile: `maturin 1.15.0 build --profile dev --locked`, rustc 1.99.1, PyO3
abi3-py310, no optional features, from a `core.autocrlf=true` checkout of
`7f1996f`. Windows: built on a CLB workstation. Linux x86_64: built on the CLB
Slurm cluster under Apptainer in
`quay.io/pypa/manylinux2014_x86_64@sha256:dc58399aca4cfb0de257f92e2de71b4f8421e60cce8542fcd5e28df0c0760942`
-- the image `.github/workflows/terrio-native-wheels.yml` (PyO3/maturin-action,
`manylinux: auto`) used for the previous Linux wheel -- at that job's workspace
path (Slurm job 72870). `scripts/build_terrio_wheel.py from-maturin` then
repackaged each result only after checking that its Python files are the locked
bytes, that it has exactly one native extension and nothing vendored, and that
its licenses match the reviewed web-lock bytes. Both wheels have the same
layout, METADATA, licenses and RECORD scheme. Unoptimized dev-profile extensions
are large (171.7 MB on Windows, where symbols live in a `.pdb`; 367.2 MB on
Linux, where they stay in the binary).

The workflow builds both platforms again as a reproducibility observation
(`matches_reviewed_entry`). Windows links embed a timestamp and paths, so the
Windows native is not expected to repeat across machines. A different digest is
never a replacement: it needs a new reviewed identity, never these names.

### What CI proves on each platform

`tests.yml` job `native` runs on ubuntu x86_64 and Windows: acquire the wheel
by committed digest, run the guard,
the whole pipeline suite with GDAL, `tests/terrio-publication.py` (exact
Terrio-vs-GDAL PMTiles RGBA, coverage, zooms and bounds on the dry / one-pixel
/ edge / off-grid / partial-alpha fixtures; exact DEFLATE COGs; each LERC COG
within the unchanged 0.01 + one-ULP bound of its exact supplied arrays;
failure atomicity) and `tests/terrio-synthetic-default.py` (omitted-backend
default dispatch on a synthetic EPSG:2277 grid). `native-identity` then holds
the Linux wheel's Terrio tiles to the Windows wheel's wherever the tilers
received identical input.

The COG writer is called with `COG_OVERVIEW_POLICY=SOURCE`
(`pipeline/fim1d/terrio_cog.py`). The supplied overview arrays have GDAL's ceil
sizes, which the default policy of Terrio 0.9.0 (GDAL 3.13's floored halving)
refuses on all 72 real-pilot COGs. The option is recorded in the writer
report's `options`, and the report's `source_commit` is read from the Python
lock rather than written as a literal.

Reported, not gated: on the smooth synthetic gradient, Terrio and GDAL differ
by one 8-bit level in some bilinear/average-resampled RGB pixels (18,847 and
41,959 pixels over two 17-tile profiles, measured with the `7f1996f` wheels on
Windows and Linux x86_64; alpha, coverage, zooms and bounds exact). The
previous runtime gave 18,783 and 41,904: Terrio 0.9.0 keeps upstream's
grid-invariant warp sampling in the tile writer (maintainer decision,
2026-11-21), which moves 339 synthetic-profile pixels by one level and changes
those profiles' per-tile digests. `TERRIO_WARP_GRID=GDAL` reproduces the
previous wheel's tiles exactly, and the 72-archive real pilot is identical
either way. The GDAL comparison was already inexact with the previous wheel,
and it is the GDAL reference that moved, not Terrio: on identical colourised input the
previous reviewed wheel's tiles were byte-stable and matched GDAL 3.10.1 exactly (0 / 0
differing pixels), while GDAL 3.13.3's own tiles differ from 3.10.1's in all 17.
Parity against GDAL, including the 72-archive pilot corpus measured with 3.13.3,
is parity with a reference that itself drifts between GDAL releases. The accepted exact gates
remain the synthetic fixtures above and the 72-archive real-pilot corpus. With
the previous runtime on arm64, both backends' archives differed from x86_64
together (20 tiles instead of 17), which is GDAL-side floating point upstream of
the tilers; arm64 is not a reviewed platform for 0.9.0.

## Rebuilding

In the pinned CLB Terrio checkout, use locked Cargo dependencies and
`node js/build.mjs --target web --out-dir pkg-viewer-7f1996f --no-default-features --features netcdf-hdf5`
(single-threaded, `wasm-release` profile). See Terrio `docs/scientific-wasm-build.md`.
Retained tools were rustc 1.99.1 and wasm-pack 0.15.0. The lock verifies output bytes; this is not a hermetic compiler
build claim. Different bytes require a new reviewed artifact identity/digest.
`build_terrio_wheel.py wrap` wraps the existing native artifact, preserving its bytes,
with fixed ZIP timestamps/order/permissions and valid RECORD/license paths.
The draft contains preparation candidates and does not deploy a public app.
