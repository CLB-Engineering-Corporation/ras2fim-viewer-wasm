# Pinned Terrio assets and reference controls

The default site uses `terrio-slices`, selected through the catalog. It requires
the complete eight-asset package in `pipeline/common/terrio-assets.lock.json`:
Terrio source `9c644f4a1729e253f9714813912f54d32e306c38`, WASM SHA256
`e9f0a57ce955b71a74779cac9da73e176926f31a6ba442d569923b228316ebd5`.
Both declarations, package metadata and three license/notice files are locked.
Snippets must be included and inventoried when generated; this build has none.

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
python scripts/terrio_release_assets.py acquire --sha256 5eb50b10bd4f3bf0f39423834d8428b64388d9a893165c36dc3f0327ecaadae6 --destination .terrio-validation/runtime
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
platform, all version `0.6.1+clb9c644f4.1`, all from Terrio source
`9c644f4a1729e253f9714813912f54d32e306c38`, none on PyPI:

| Lock key | Wheel | SHA256 |
|---|---|---|
| `win_amd64` | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl` | `c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346` |
| `linux_x86_64` | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | `d4fa7a2d2ead71b173156e2e8859fb0370b5ad04d6da88b69824db85402c9e3d` |
| `linux_aarch64` | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_28_aarch64.whl` | `3095366023a5ca095aa528477ce60b54021002b09948f2d58d8515c30260cb93` |
| `macos_arm64` | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_11_0_arm64.whl` | `6b7b20e914ec6c6b32da816c3c79b3fa96171933016bdb45cc88394863e9c228` |
| `macos_x86_64` | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_10_12_x86_64.whl` | `3b6381af2e0e82450282ad09e220e8efe531a9d26d3df3956a19543296ff7e9a` |

```sh
python scripts/terrio_release_assets.py wheel --destination <new-dir>   # this interpreter's platform
python -m pip install --no-deps <new-dir>/terrio-*.whl                 # then numpy, affine
```

The acquirer downloads the exact committed filename and refuses any byte that
does not match `pipeline/common/terrio-release.lock.json`. Install into a
dedicated environment with GDAL >= 3.8 (conda-forge works on every platform;
CI uses GDAL 3.13.3). musllinux, Windows ARM64 and other platforms have no
reviewed artifact: use the explicit GDAL controls there.

`pipeline/common/terrio-python.lock.json` (schema 2) holds one Python inventory
and one native extension per platform (`_terrio.pyd` on Windows,
`_terrio.abi3.so` elsewhere). The 50 Python files are byte-identical on every
platform -- they are the `9c644f4` blobs as a `core.autocrlf=true` checkout
writes them (CRLF), which is what the Windows artifact was reviewed with.
`require_terrio()` selects the entry for `sys.platform`/`platform.machine()`,
checks every locked Python file and the actual loaded extension, refuses a
competing ABI-qualified extension or another platform's artifact, and fails
closed on an unreviewed platform. Missing/DLL/ABI import failures name the
explicit `--writer-backend gdal` and `--backend gdal` controls.
`platform_view()` reproduces the exact schema-1 inventory each wheel embeds as
`terrio-source.json`; for `win_amd64` it is byte for byte the object the
original Windows wheel and runtime bundle were made from.

### How the Linux and macOS wheels were built

The reviewed Windows `_terrio.pyd` is byte-identical to Cargo's dev-profile
output in the pinned tree (`maturin develop`; `debug = 0`, openjp2 optimized),
rustc 1.99.1, PyO3 abi3-py310, no optional features. The other platforms match
that configuration, not Terrio's upstream release profile:
`.github/workflows/terrio-native-wheels.yml` checks out `9c644f4` with
`core.autocrlf=true`, runs `maturin 1.15.0 build --profile dev --locked` under
rustc 1.99.1 (in the PyPA manylinux2014 / manylinux_2_28 images on Linux,
natively on macOS), then `scripts/build_terrio_wheel.py from-maturin`
repackages the result only if its Python files are the locked bytes, it has
exactly one native extension and nothing vendored, and its licenses match the
reviewed web-lock bytes. The resulting layout, METADATA, licenses and RECORD
scheme are the Windows wheel's. Unoptimized dev-profile extensions are large
(279-325 MB; symbol tables live in the binary, where Windows uses a `.pdb`).

`linux_x86_64`, `linux_aarch64` and `macos_arm64` were rebuilt on fresh runners
byte for byte. A rerun reports `matches_reviewed_entry`; a different digest
needs a new reviewed identity, never these names.

### What CI proves on each platform

`tests.yml` job `native` runs on ubuntu x86_64 and arm64, macOS arm64 and
x86_64, and Windows: acquire the wheel by committed digest, run the guard,
the whole pipeline suite with GDAL, `tests/terrio-publication.py` (exact
Terrio-vs-GDAL PMTiles RGBA, coverage, zooms and bounds on the dry / one-pixel
/ edge / off-grid / partial-alpha fixtures; exact DEFLATE COGs; each LERC COG
within the unchanged 0.01 + one-ULP bound of its exact supplied arrays;
failure atomicity) and `tests/terrio-synthetic-default.py` (omitted-backend
default dispatch on a synthetic EPSG:2277 grid). `native-identity` then holds
every platform's Terrio tiles to the reviewed Windows wheel's wherever the
tilers received identical input.

Reported, not gated: on the smooth synthetic gradient, Terrio and GDAL differ
by one 8-bit level in some bilinear/average-resampled RGB pixels (about 18.8k
and 41.9k pixels over two 17-tile profiles; alpha, coverage, zooms and bounds
exact). This already happens on Windows with the reviewed wheel, and it is
the GDAL reference that moved, not Terrio: on identical colourised input the
reviewed wheel's tiles are byte-stable and match GDAL 3.10.1 exactly (0 / 0
differing pixels), while GDAL 3.13.3's own tiles differ from 3.10.1's in all 17.
Parity against GDAL, including the 72-archive pilot corpus measured with 3.13.3,
is parity with a reference that itself drifts between GDAL releases. The accepted exact gates
remain the synthetic fixtures above and the 72-archive real-pilot corpus. On
arm64 both backends' archives differ from x86_64 together (20 tiles instead of
17), which is GDAL-side floating point upstream of the tilers.

## Rebuilding

In the pinned CLB Terrio checkout, use locked Cargo dependencies and
`node js/build.mjs --target web --out-dir pkg-viewer-final --no-default-features --features netcdf-hdf5`.
See Terrio `docs/scientific-wasm-build.md`. Retained tools were rustc 1.99.1 and
wasm-pack 0.15.0. The lock verifies output bytes; this is not a hermetic compiler
build claim. Different bytes require a new reviewed artifact identity/digest.
`build_terrio_wheel.py wrap` wraps the existing native artifact, preserving its bytes,
with fixed ZIP timestamps/order/permissions and valid RECORD/license paths.
The draft contains preparation candidates and does not deploy a public app.
