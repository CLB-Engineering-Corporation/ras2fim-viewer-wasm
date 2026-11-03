# Reviewed Terrio candidate artifacts

The viewer fork holds candidate artifacts under draft tag `viewer-runtime-9c644f4`.
The source runtime is CLB Terrio `9c644f4a1729e253f9714813912f54d32e306c38`.
The checked-in `pipeline/common/terrio-release.lock.json` records actual archive
and wheel digests separately from the complete inner web/Python locks. Draft
preparation is not a public application deployment or a production release.

From a fresh checkout with authenticated GitHub CLI (same-repository draft-capable access):

```sh
python scripts/terrio_release_assets.py acquire --sha256 5eb50b10bd4f3bf0f39423834d8428b64388d9a893165c36dc3f0327ecaadae6 --destination .terrio-validation/runtime
python -m pipeline.fim2d.site <nc-directory> --out <site-directory>
python -m pipeline.fim2d.validate <site-directory> --deep
```

The acquirer downloads the exact named asset from
`CLB-Engineering-Corporation/ras2fim-viewer-wasm`, verifies the externally pinned
archive SHA256, validates its complete inventory and both inner locks, stages
safe extraction, then imports the web package into the verified cache. Default
site builds copy only verified assets, record provenance and fail on unavailable
or altered bytes. No decoder downgrade occurs. `--archive PATH` supports offline
acquisition with the same digest. Existing destinations are refused and preserved.
`TERRIO_ASSET_CACHE` selects a fresh cache when validating independence from local
state. The dedicated CI asset job uses an ephemeral contents-write token for GitHub draft
visibility, as do `native` (per-platform wheels) and the Safari acceptance
session job (inputs); all other jobs remain read-only. No persistent OAuth token is copied
into secrets. Fork PR tokens retain GitHub's read-only cap and cannot silently
bypass the default gate. CI uses the committed digest , never a digest
fetched beside the download; pinned default-site validation is required by all-green.

The bundle is 171643130 bytes. It contains `web/`, `python/terrio/`, three
license/notice files and a complete manifest. Entry/file/total/manifest limits
are 1024 / 192 MiB / 256 MiB / 1 MiB, justified by the 154677760-byte extension
plus 14376789-byte WASM. Traversal, case aliases, drive/ADS paths, symlinks,
special files, encryption and unsupported codecs are rejected. Parent paths
remain caller-controlled; do not permit concurrent untrusted parent mutation.
A later importer failure leaves verified directories for inspection.

The native publication wheels are separate assets, one per platform; names,
sizes, digests and asset IDs are in `pipeline/common/terrio-release.lock.json`
(`wheels`) and the table in [terrio-assets.md](terrio-assets.md):

| Asset | Bytes | SHA256 | Asset ID |
|---|---:|---|---:|
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl` | 156287240 | `c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346` | 705274190 |
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | 326687500 | `d4fa7a2d2ead71b173156e2e8859fb0370b5ad04d6da88b69824db85402c9e3d` | 705967216 |
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_28_aarch64.whl` | 313167433 | `3095366023a5ca095aa528477ce60b54021002b09948f2d58d8515c30260cb93` | 705967211 |
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_11_0_arm64.whl` | 289463026 | `6b7b20e914ec6c6b32da816c3c79b3fa96171933016bdb45cc88394863e9c228` | 705967212 |
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_10_12_x86_64.whl` | 280884685 | `3b6381af2e0e82450282ad09e220e8efe531a9d26d3df3956a19543296ff7e9a` | 705967214 |

`python scripts/terrio_release_assets.py wheel --destination <new-dir>
[--platform KEY]` downloads the exact committed filename with authenticated
`gh`, checks size and SHA256 before naming it, and refuses an existing
destination; `--wheel PATH` does the same offline. The Windows wheel wraps the
reviewed binary without recompiling. The four Linux/macOS wheels were compiled
from `9c644f4` by `.github/workflows/terrio-native-wheels.yml` in the Windows
artifact's configuration (see terrio-assets.md), independently reviewed
(digest, RECORD, Python files byte-identical to the Windows wheel, licenses,
architecture, no vendored libraries) and uploaded as new assets; three were
reproduced byte for byte by a second CI build. Every wheel's embedded
`terrio-source.json` equals the committed lock's `platform_view()` for its
platform. The guard verifies the actual loaded native origin and inventory per
platform; another platform's or an unreviewed ABI-qualified extension is refused.

The draft also carries three acceptance inputs used by the Safari acceptance
workflow (`acceptance-filter_depth_wb-2427467.nc`, `acceptance-fixture-*.nc`),
pinned in `tests/safari_acceptance/inputs.json`. They are test data, not runtime.

Reproduction tools package existing reviewed inputs without recompiling:
`scripts/terrio_release_assets.py bundle --web <reviewed-web> --python <reviewed-python-package>
--output <new-zip> --compression stored` and
`scripts/build_terrio_wheel.py wrap <reviewed-python-package> <license-root> <new-output-dir>`
(byte-identical regeneration of the Windows wheel was re-verified after the
multi-platform refactor) and `scripts/build_terrio_wheel.py from-maturin ...` for CI builds.
Stored ZIP entries have fixed timestamps/order/permissions. The wheel RECORD
covers every payload. Deflated bundle mode additionally depends on zlib version.
This is artifact verification/repacking, not a hermetic compiler-build claim.
Synthetic tests cover digest/inner-inventory failures, safe extraction, cap and
path refusals, deterministic outputs and wheel RECORD/license preservation.

A source-locked byte-identical rebuild is required before replacing any artifact
lock. Keep previous locks/assets for rollback. Do not overwrite candidate assets
in place; a changed artifact needs a new reviewed tag/digest. Final adoption QAQC
records exact draft asset IDs/locations, fresh acquisition and browser evidence.


Packaging revision `.1` (shared by every platform's wheel) corrects License-File paths to be relative to the
`.dist-info/licenses/` directory as required by the
[wheel specification](https://packaging.python.org/en/latest/specifications/binary-distribution-format/).
A regression resolves every declared license path. Native and Python executable
bytes are unchanged. The earlier wheel remains in the draft audit trail and is
superseded; acquisition/install instructions select the exact revised filename.
