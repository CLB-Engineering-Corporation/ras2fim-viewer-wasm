# Reviewed Terrio candidate artifacts

The viewer fork holds candidate artifacts under draft tag `viewer-runtime-7f1996f`.
The source runtime is CLB Terrio 0.9.0, `7f1996f972645c7d4b71822702b9fc331ad36df9`
(fork branch `reconcile/upstream-80c9e7a`, fork PR #45). The previous runtime's
draft, `viewer-runtime-9c644f4`, is kept unchanged for rollback.
The checked-in `pipeline/common/terrio-release.lock.json` records actual archive
and wheel digests separately from the complete inner web/Python locks. Draft
preparation is not a public application deployment or a production release.

From a fresh checkout with authenticated GitHub CLI (same-repository draft-capable access):

```sh
python scripts/terrio_release_assets.py acquire --sha256 c0dcfdf5cecc05df19636caf25f785b1c9a3ba7aeeddfc0f4d384afdcf5fd00c --destination .terrio-validation/runtime
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

The bundle is 189596505 bytes, 71 entries. It contains `web/` (the nine locked
files, including the wasm-bindgen snippet), `python/terrio/` (55 Python files,
`_terrio.pyi`, `py.typed` and the Windows extension), three license/notice files
and a complete manifest. Entry/file/total/manifest limits are
1024 / 192 MiB / 256 MiB / 1 MiB, justified by the 171731968-byte extension
plus 15056333-byte WASM. Traversal, case aliases, drive/ADS paths, symlinks,
special files, encryption and unsupported codecs are rejected. Parent paths
remain caller-controlled; do not permit concurrent untrusted parent mutation.
A later importer failure leaves verified directories for inspection.

The native publication wheels are separate assets, one per reviewed platform
(Windows AMD64 and Linux x86_64 since 0.9.0); names, sizes, digests and asset
IDs are in `pipeline/common/terrio-release.lock.json` (`wheels`) and the table in
[terrio-assets.md](terrio-assets.md):

| Asset | Bytes | SHA256 | Asset ID |
|---|---:|---|---:|
| `terrio-0.9.0+clb7f1996f.1-cp310-abi3-win_amd64.whl` | 173508688 | `a27f001339c1015dbf0009f9a960c592ded643db2a04737a1a761410037fe938` | 776910363 |
| `terrio-0.9.0+clb7f1996f.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | 368942948 | `9ee1b1a0d33bee1dd43e28e5e5b26aa99383def3b5e190bc3306b5b6dec4387b` | 776910358 |

`python scripts/terrio_release_assets.py wheel --destination <new-dir>
[--platform KEY]` downloads the exact committed filename with authenticated
`gh`, checks size and SHA256 before naming it, and refuses an existing
destination; `--wheel PATH` does the same offline. Both wheels were compiled
from `7f1996f` in the Cargo dev profile and repackaged by
`build_terrio_wheel.py from-maturin` (Windows on a CLB workstation, Linux x86_64
on the CLB Slurm cluster in the workflow's pinned manylinux2014 image; see
terrio-assets.md), checked (digest, RECORD, Python files byte-identical between
the two wheels, licenses, architecture, no vendored libraries) and uploaded as
new assets. Each wheel's embedded `terrio-source.json` equals the committed
lock's `platform_view()` for its platform. The guard verifies the actual loaded native origin and inventory per
platform; another platform's or an unreviewed ABI-qualified extension is refused.

The draft also carries three acceptance inputs used by the Safari acceptance
workflow (`acceptance-filter_depth_wb-2427467.nc`, `acceptance-fixture-*.nc`),
pinned in `tests/safari_acceptance/inputs.json`. They are test data, not runtime,
and byte-identical to the copies on `viewer-runtime-9c644f4`. Safari acceptance
has not been run against the 0.9.0 runtime.

Reproduction tools package existing reviewed inputs without recompiling:
`scripts/terrio_release_assets.py bundle --web <reviewed-web> --python <reviewed-python-package>
--output <new-zip> --compression stored` and
`scripts/build_terrio_wheel.py wrap <reviewed-python-package> <license-root> <new-output-dir>`
and `scripts/build_terrio_wheel.py from-maturin ...` for maturin builds (both
0.9.0 wheels; it refuses Python bytes that differ from the lock).
Stored ZIP entries have fixed timestamps/order/permissions. The wheel RECORD
covers every payload. Deflated bundle mode additionally depends on zlib version.
This is artifact verification/repacking, not a hermetic compiler-build claim.
Synthetic tests cover digest/inner-inventory failures, safe extraction, cap and
path refusals, deterministic outputs and wheel RECORD/license preservation.

A source-locked byte-identical rebuild is required before replacing any artifact
lock. Keep previous locks/assets for rollback. Do not overwrite candidate assets
in place; a changed artifact needs a new reviewed tag/digest. Final adoption QAQC
records exact draft asset IDs/locations, fresh acquisition and browser evidence.


Packaging revision `.1` (`REVISION` in `build_terrio_wheel.py`, shared by every
platform's wheel) writes License-File paths relative to the `.dist-info/licenses/`
directory as required by the
[wheel specification](https://packaging.python.org/en/latest/specifications/binary-distribution-format/).
A regression resolves every declared license path. For `9c644f4` it corrected an
earlier revision-0 Windows wheel, which remains in that draft's audit trail as
superseded; the 0.9.0 wheels were only ever packaged at revision `.1`.
