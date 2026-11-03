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
credential is copied into repository secrets. Other jobs remain read-only.

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

## Native publication artifact

The reviewed native wheel is `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl`,
SHA256 `c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346`.
Acquire that exact filename, verify its digest, then install in a dedicated
compatible Windows environment before resolving `.[fim1d]`. It is not on PyPI.
It wraps the reviewed abi3-py310 binary without recompiling; all three licenses
and a complete RECORD are included. Packaging revision `.1` corrects license
metadata paths; Python/native executable bytes are unchanged. Isolated Python
3.12 installation and actual loaded-origin/package hash validation pass.

The runtime guard checks every locked Python file and the actual loaded native
extension; competing ABI-qualified artifacts are refused. Missing/DLL/ABI import
failures name explicit `--writer-backend gdal` and `--backend gdal` controls.
Other native platforms need their own reviewed build/lock/wheel or those explicit
GDAL controls; universal browser WASM is independent of that limitation.

## Rebuilding

In the pinned CLB Terrio checkout, use locked Cargo dependencies and
`node js/build.mjs --target web --out-dir pkg-viewer-final --no-default-features --features netcdf-hdf5`.
See Terrio `docs/scientific-wasm-build.md`. Retained tools were rustc 1.99.1 and
wasm-pack 0.15.0. The lock verifies output bytes; this is not a hermetic compiler
build claim. Different bytes require a new reviewed artifact identity/digest.
`build_terrio_wheel.py` wraps the existing native artifact, preserving its bytes,
with fixed ZIP timestamps/order/permissions and valid RECORD/license paths.
The draft contains preparation candidates and does not deploy a public app.
