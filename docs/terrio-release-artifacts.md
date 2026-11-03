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
visibility; all other jobs remain read-only. No persistent OAuth token is copied
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

The separate wheel is `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl`,
156287240 bytes, SHA256
`c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346`.
Download it with authenticated `gh release download viewer-runtime-9c644f4 --repo
CLB-Engineering-Corporation/ras2fim-viewer-wasm --pattern 'terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl' --dir <new-dir>`,
verify that digest, then install into a dedicated Windows environment. The wheel
contains the exact reviewed package/native bytes and all licenses; it is not on
PyPI. Its local version satisfies the Windows fim1d dependency group after import.
The guard verifies the actual loaded native origin and inventory; an unreviewed
ABI-qualified competitor is refused. This artifact was installed and verified
in isolated Python 3.12. Other native platforms need their own reviewed artifact
or explicit GDAL fallback; browser WASM is platform-independent.

Reproduction tools package existing reviewed inputs without recompiling:
`scripts/terrio_release_assets.py bundle --web <reviewed-web> --python <reviewed-python-package>
--output <new-zip> --compression stored` and
`scripts/build_terrio_wheel.py <reviewed-python-package> <license-root> <new-output-dir>`.
Stored ZIP entries have fixed timestamps/order/permissions. The wheel RECORD
covers every payload. Deflated bundle mode additionally depends on zlib version.
This is artifact verification/repacking, not a hermetic compiler-build claim.
Synthetic tests cover digest/inner-inventory failures, safe extraction, cap and
path refusals, deterministic outputs and wheel RECORD/license preservation.

A source-locked byte-identical rebuild is required before replacing any artifact
lock. Keep previous locks/assets for rollback. Do not overwrite candidate assets
in place; a changed artifact needs a new reviewed tag/digest. Final adoption QAQC
records exact draft asset IDs/locations, fresh acquisition and browser evidence.


Packaging revision `.1` corrects License-File paths to be relative to the
`.dist-info/licenses/` directory as required by the
[wheel specification](https://packaging.python.org/en/latest/specifications/binary-distribution-format/).
A regression resolves every declared license path. Native and Python executable
bytes are unchanged. The earlier wheel remains in the draft audit trail and is
superseded; acquisition/install instructions select the exact revised filename.
