# Pinned Terrio viewer assets

The default site build requires the complete package identified by
`pipeline/common/terrio-assets.lock.json`. This locks source
9c644f4a1729e253f9714813912f54d32e306c38 and every shipped byte, including
JavaScript, both declarations, package metadata and three license/notice files.
The WASM SHA256 is e9f0a57ce955b71a74779cac9da73e176926f31a6ba442d569923b228316ebd5.
No binary or invented public download URL is checked in.

Acquire the reviewed package from the coordinator's retained local package or a
future immutable CLB release. After extracting it to an otherwise empty directory:

```sh
python -m pipeline.common.terrio_assets --package /path/to/package
python -m pipeline.fim2d.site /path/to/nc --out site
python -m pipeline.fim2d.validate site --deep
```

`TERRIO_ASSET_CACHE` overrides the cache root (default
`~/.cache/ras2fim-terrio`); the source commit names its package directory.
Import checks the lock before staging and renaming, and refuses to replace a
corrupt existing cache. Remove/quarantine such a cache explicitly before retrying.
Every default build verifies the bytes again. Missing or changed assets stop the
build before viewer/vendor acquisition or output replacement. There is no network
fetch or silent downgrade. CI must acquire/import the same package before default
site builds; asset unit tests use synthetic packages and require no downloads.

`--reader-backend h5wasm` explicitly omits Terrio. `--terrio-package PATH`
retains local development overrides, inventories their bytes/licenses and marks
provenance and catalog as `local-override`; these are not claimed to match the lock.
The catalog's `reader_backend` is the integration contract for the app/worker owner.
This patch does not implement browser backend selection.

## Rebuilding and release prerequisites

In the CLB Terrio repository at the exact source commit above, use the locked
Cargo dependencies and `node js/build.mjs --target web --out-dir pkg-viewer-final
--no-default-features --features netcdf-hdf5`. See Terrio's
`docs/scientific-wasm-build.md`. The retained build used rustc 1.99.1 and
wasm-pack 0.15.0. This is a reproducible verification/acquisition path, not a
claim of hermetic compilation: wasm-bindgen/wasm-opt and the complete build
environment must be pinned for byte-for-byte rebuilds. Any different output is
rejected; changing the reviewed lock requires explicit release review.

Before CI/release can work on a fresh host, the coordinator must publish or
otherwise supply the full reviewed package (including licenses) through an
immutable CLB artifact, record its archive digest and actual acquisition location,
and arrange CI credentials if private. No public artifact currently exists in
this patch. Do not add an unverified mutable URL. Browser default selection,
persistent module/worker reuse, and browser acceptance remain with their owners.

Overlay integration: copy each file below `viewer_adoption/` to the same relative
path in the viewer repository. Run its existing Node/Python suites after combining
owners' changes. Asset regressions alone:
`python -m unittest discover -s tests -p test_terrio_assets.py`.
