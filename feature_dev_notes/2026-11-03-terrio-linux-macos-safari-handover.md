# Terrio on Linux/macOS and Safari memory acceptance — handover

Completed 2026-11-03. This continues `2026-11-03-terrio-default-adoption-qaqc-handover.md`, which is still authoritative for everything not described here. Work ran in an independent local clone, `C:/Users/billk_clb/work/r2f-terrio-xplat`, branch `terrio-linux-macos-safari`. The NAS checkout and its `.git` were not written; this note is the only NAS write.

Nothing upstream (opengeos/terrio), no force push, no gh-pages change, and no existing release asset or lock was replaced or deleted.

## Delivery state

- **PR:** [CLB PR #6](https://github.com/CLB-Engineering-Corporation/ras2fim-viewer-wasm/pull/6), head `4a97204d20e2a3407731239baa6d589897ab8021`. Marked ready for review and **not merged**.
- **Merge decision.** `tests` (all-green), `pinned Terrio runtime` and `pinned Terrio native wheels` pass on the head. The three `Safari acceptance` session checks fail because measured values exceed limits that were declared before any run (details below). The merge condition was "all checks pass", so the PR was left open for the reviewer's decision. The work is complete as evidence; the failures are findings, not defects to fix by relaxing limits.
- **Independent review.** A fresh reviewer subagent was given the diff and requirements, not my conclusions. Every finding was fixed in `4a97204` (see "Review").

## Goal A: native publication on Linux and macOS

### Reviewed artifacts

All wheels are version `0.6.1+clb9c644f4.1` and were uploaded as new assets to draft `viewer-runtime-9c644f4` (release ID `432562752`, still a draft).

| Lock key | Asset | Bytes | SHA256 | Asset ID |
|---|---|---:|---|---:|
| win_amd64 (existing, unchanged) | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl` | 156287240 | `c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346` | 705274190 |
| linux_x86_64 | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | 326687500 | `d4fa7a2d2ead71b173156e2e8859fb0370b5ad04d6da88b69824db85402c9e3d` | 705967216 |
| linux_aarch64 | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-manylinux_2_28_aarch64.whl` | 313167433 | `3095366023a5ca095aa528477ce60b54021002b09948f2d58d8515c30260cb93` | 705967211 |
| macos_arm64 | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_11_0_arm64.whl` | 289463026 | `6b7b20e914ec6c6b32da816c3c79b3fa96171933016bdb45cc88394863e9c228` | 705967212 |
| macos_x86_64 | `terrio-0.6.1+clb9c644f4.1-cp310-abi3-macosx_10_12_x86_64.whl` | 280884685 | `3b6381af2e0e82450282ad09e220e8efe531a9d26d3df3956a19543296ff7e9a` | 705967214 |

Native extension SHA256s (`_terrio.abi3.so`):

- linux_x86_64: `bb6bef4e80781c4599f87d4d14ccd52e2dcd35dc6ef5a63ab2c40ea003ee79e9`
- linux_aarch64: `8700aa141f4b02129c54b682f7bf44684b054c95fd39c913487eed3fe4b30533`
- macos_arm64: `456c530ad3595e566eee21cca7683ce94ad719860a0ddbf9ef849777995f08cf`
- macos_x86_64: `04c573d1e3e480c64fd7317b2f5c7472a886a44a879a3b578f2a3380d6fef6ce`

GitHub's server-side asset digests match these.

Three draft test-data assets were also added, for the Safari runs only:

- `acceptance-filter_depth_wb-2427467.nc`, `cfcacf5b…` (705908190)
- `acceptance-fixture-receding.nc`, `524b6439…` (705908197)
- `acceptance-fixture-badshape.nc`, `9f44bb3b…` (705908196)

These are the accepted Windows run's exact inputs. The two WSEL pilot streams are already public on gh-pages.

### Build identity (what had to match)

- **Windows binary.** The reviewed Windows `_terrio.pyd` (`9ce8973a…`) is byte-identical to `target-clb-semantic/debug/_terrio.dll` in the pinned Terrio tree. It was built with `maturin develop`, the Cargo **dev** profile (`debug = 0`, openjp2 optimized), rustc 1.99.1, abi3-py310 and no optional features.
- **Python files.** All 50 locked Python files are the `9c644f4` blobs as a `core.autocrlf=true` checkout writes them (CRLF). `LICENSE` and `NOTICE` are locked CRLF; `LICENSE-THIRD-PARTY.md` is locked LF.
- **Linux/macOS builds.** `.github/workflows/terrio-native-wheels.yml` reproduces that: a CRLF checkout of `9c644f4` and `maturin 1.15.0 build --profile dev --locked` under rustc 1.99.1, in the PyPA manylinux2014 / manylinux_2_28 images on Linux and natively on macOS. It then runs `build_terrio_wheel.py from-maturin`, which accepts the build only if:
  - the Python bytes equal the lock;
  - there is exactly one native extension and nothing vendored;
  - the license bytes equal the reviewed web-lock bytes.
- **Independent review of each wheel.** Digest, RECORD, the 50 Python files and METADATA all byte-identical to the Windows wheel; licenses; architecture (ELF x86_64/aarch64, Mach-O arm64/x86_64); no other entries. Every wheel's `terrio-source.json` equals `platform_view()` of the committed lock.
- **Reproducibility.** All four natives and wheels were rebuilt on fresh runners byte for byte, three of them twice. Workflow runs: 41653208901 (three platforms), 41655030178 (all four) and 41667438648 (all four, `matches_reviewed_entry: true`).
- **Caveats.**
  - The manylinux Docker images are `:latest`, not digest-pinned; reproduction held anyway.
  - Dev-profile extensions are large (279–325 MB) because their symbol tables are in-binary.

### Code

- **`terrio-python.lock.json` (schema 2).** Holds `python_sha256` plus `native.{win_amd64, linux_x86_64, linux_aarch64, macos_arm64, macos_x86_64}`. `platform_view()` reproduces the exact schema-1 object for `win_amd64`: the embedded `terrio-source.json` SHA is `6de59ec0…`, test-pinned. The runtime bundle's acquisition and validation are therefore unchanged. The refactored `build_terrio_wheel.py wrap` regenerates `c40983634cc8…` byte for byte.
- **`require_terrio()`** selects by `sys.platform`/`platform.machine()`. It checks every locked file and the actual loaded origin, and refuses competing `_terrio*.so/.pyd` files and other platforms' artifacts. On an unreviewed platform it fails closed and names `--writer-backend gdal` / `--backend gdal`.
- **`terrio-release.lock.json` (schema 2).** Now has `wheels.{key}`. `terrio_release_assets.py wheel [--platform] --destination` downloads the exact committed name and verifies size and SHA before naming the file.
- **`pyproject.toml`.** The `fim1d` marker uses explicit equalities for exactly the five reviewed platforms, and a test holds the marker to the lock. musllinux and Windows ARM64 have no artifact; use the GDAL controls there.

### Runner proof

The `tests.yml` jobs `native` and `native-identity` are both required by all-green and passed on the head: run 41667449428, after a capacity re-run.

- **`native`** runs on ubuntu x86_64 and arm64, macOS 26 arm64, macOS 15 x86_64, and Windows Server 2025, with micromamba GDAL 3.13.3, Python 3.12 and go-pmtiles 1.31.2 (pinned digests). On each runner:
  - the guard loads exactly that platform's locked native artifact;
  - the full unittest suite passes with GDAL active (134 tests);
  - `tests/terrio-publication.py` is exact on all five platforms: the dry, one-pixel, edge, off-grid and partial-alpha archives are exact (RGBA, coverage, zooms, bounds); DEFLATE COGs are exact; each LERC COG is within the unchanged 0.01 + one-ULP bound against its exact supplied arrays; failure atomicity holds.
- **Default dispatch.** `tests/terrio-synthetic-default.py` (new) runs omitted-backend default dispatch on a synthetic EPSG:2277 grid. COG and PMTiles select Terrio; the supplied arrays are identical between backends; both writers meet the codec bound (max error 0.0100002289).
- **Not exact, reported rather than gated or toleranced.** RGB differs by ≤1 level in about 18.8k (profile 0) and 41.9k (profile 1) bilinear/average-resampled pixels across 17 tiles. Alpha, coverage, zooms and bounds are exact. The same happens on Windows with the reviewed wheel and the workstation's GDAL: 18,741 / 41,916 pixels. It is a property of the pinned runtime on smooth gradients. The accepted exact gates remain the synthetic fixtures and the 72-archive pilot corpus.
- **`native-identity`** compares every platform with the same run's win_amd64 job:
  - **Windows and macOS x86_64:** the tiler input (pixels, geotransform, size, CRS) is identical, and Terrio tiles are byte-identical to the reviewed Windows wheel's. This is the gated case.
  - **Linux x86_64:** the pixels are identical but the geotransform differs in its last ULPs (PROJ/libm), so the gate rates it "not attributable". The Terrio and GDAL tiles were nonetheless byte-identical to Windows.
  - **arm64 (Linux and macOS, identical to each other):** the colourised input pixels differ from x86_64, and both archives change together (20 tiles, not 17). This is GDAL/numpy-side floating point upstream of Terrio. Its magnitude was not measured; it is an open observation.
  - The gate fails if no platform is comparable.
- **Real-pilot corpus.** It was not rerun on Linux/macOS, because the corpus is private local data. The 72-archive check and `terrio-default-publication.py` remain Windows evidence.

## Goal B: Safari and target-device memory

### Method

- **Harness.** `tests/adoption_acceptance/safari.mjs` drives real Safari via `safaridriver` (W3C WebDriver). It implements exactly the Playwright surface that `driver.mjs` and `driver-probes.mjs` use; `driver.mjs` changes are minimal and engine-neutral.
- **What WebDriver can't do.**
  - It has no init-script hook, so the acceptance server injects the Worker counter and an error capture into served HTML, only during a Safari session.
  - It has no network hook, so the server records every ≥400 or abandoned response.
  - Engine-internal console messages, worker console errors and requests the engine refuses before sending are not observed. These are stated limitations.
- **Windows path.** The Windows and Playwright path is unchanged, and was smoke-run locally.
- **macOS memory** (`processes.mjs`). WebKit's XPC services are children of launchd, not of the browser, so processes are attributed by executable path:
  - Safari: `Safari.app` plus the WebKit services, including `.appex`/variant layouts;
  - Mobile Safari: the same inside CoreSimulator;
  - Playwright WebKit: its process tree plus `ms-playwright`.
  The value is ps RSS in bytes. It is not the Windows working set the baseline measured, excludes compressed memory, and Safari's total includes its helper extensions. A sample without a WebContent process is a structural failure.
- **Site.** Built on each macOS runner from the reviewed runtime archive and the inputs pinned in `tests/safari_acceptance/inputs.json`. It must match the seven `candidate-pins.json` values. These equal the Windows-accepted candidate's content; that site had CRLF in `app.js` and `netcdf-worker.js`, which the driver normalizes.
- **Design.** Per engine: preflight, then 3 trials × (cold and warm first render, 80 switches × 3 sliders, 20 each of the three recovery scenarios) per decoder, giving 480 switches, 1,440 sliders, 360 recoveries and 480 RSS endpoints.
- **Thresholds.** Committed in `5eb0903` *before any macOS run*, generated by `derive-thresholds.mjs` from `baseline.json`, and test-locked. They use the WebKit rows: timing ≤ ceil(quiet p95 × 1.5 + 100 ms); working-set max ≤ ceil(long WebKit max × 1.25 + 128 MiB), which is h5wasm 1706.8 MiB and terrio-slices 1869.1 MiB. No limit or attribution rule was changed after seeing results.

### Results (all completed, zero errors, structural audit passed)

| Engine (workflow run) | Working-set max, h5wasm | Working-set max, terrio-slices | Timing |
|---|---|---|---|
| Safari 26.6.2, macOS 26.6.2 (41663673076) | **1826.7 MiB — exceeds** 1706.8 | 1840.8 MiB, passes 1869.1 | cold h5 5954 / terrio 1893 ms and warm h5 1098 ms **exceed**; others pass |
| Safari 26.6.2, macOS 26.6.2 (41667438654) | **1996.0 MiB — exceeds** | 1828.2 MiB, passes | cold 4676 / 2135 ms and warm 1886 / 778 ms **exceed**; switches and sliders pass |
| Mobile Safari 26.5, iPhone 17 simulator, iOS 26.5 (41667438654) | 1626.8 MiB, passes | 1427.3 MiB, passes | cold 9524 / 4034 ms and warm 1573 / 1536 ms **exceed**; switches and sliders pass |
| Playwright WebKit 27.2, macOS (41663673076) | 1161.8 MiB, passes | 1120.3 MiB, passes | cold 2058 / 931 ms **exceed**; others pass |
| Playwright WebKit 27.2, macOS (41667438654) | 1184.0 MiB, passes | 1048.2 MiB, passes | cold 1659 / 851 ms **exceed**; others pass |

A preliminary desktop Safari session (run 41655030302, not audited) measured 1915.5 / 1880.8 MiB, with the terrio-slices value over its limit. That run was marked incomplete because the WebKit job, then in the same job, stalled on a warm render. Raw SHA: `166f05e4…`.

Slider renders on desktop Safari are about 40–50 ms p95, far under the limits.

Post-hoc **diagnostic** breakdown of the preliminary run (not a gate):

- WebContent accounts for about 1.56 GB at peak; helpers, browser, networking and GPU together account for about 300–400 MiB.
- Successive trials start higher (h5wasm 1275 → 1386 → 1505 MiB).
- About 1.0–1.5 GB remains after each WebDriver session closes.

This suggests Safari keeps content processes across sessions, so later trials include residue from earlier ones.

Evidence is stored as workflow artifacts `acceptance-evidence-{safari,ios-simulator,webkit}` (GitHub retention applies). Local copies are in `C:/Users/billk_clb/work/{safari-run2,webkit-run2,run3,run3s}`. Hashes (raw / audit):

- Safari 41663673076: `a7de5ffc41a88d98cd208f42fc5cbb3907327a73b8a65bcd0f417fe7f0880a79` / `23642a13b59f946043bd5bbd4232f72b194b747ae0978ac12bcebe752b49b293`
- Safari 41667438654: `3f4871da29722e15729e12509ce28c6148c790692ffe63477f45213fabf5498b` / `4b2969c4275919276431586fb8da812d7b33b68f29fa84a165b39a8c05ec2153`
- iOS 41667438654: `211c412dd7d9edf288a5fd4883403ec23dd108f1a6e56507c8cdd01d9c054a9a` / `797345b698f23c4677896fdb9ed0686b4091a3943fa6146a4fc457ad97946a85`
- WebKit 41663673076: `42af0842888bf484f6fcbce45deb3a9f14083f6c9034e38885f3713d9816ea16` / `86ec69c2ba392c8ea11cc34dc4a206e82d91ec435aee0078800b0cc83d81fde1`
- WebKit 41667438654: `1fba4937a0144b099b1c438c395feb90ff10c6636a310cfbbd61f03f54ff5b30` / `f8d98563b1c12d1b9daaa32a916b90c6b08540244f7a12ef0966eec656369874`
- iOS feasibility probe (41655030302): `111a9fc1…`

### Interpretation and limits

- **Terrio is the adopted default.** Its working set passed in both audited desktop Safari runs, and it was lower than h5wasm on Mobile Safari. The **h5wasm reference/fallback path exceeds** the historical WebKit-derived limit in both audited desktop Safari runs.
- **First-render timing exceeds** on every macOS engine. Cold renders here are fresh WebDriver/Playwright sessions on a VM, but the limits stand and these are failures of those checks.
- **These are GitHub-hosted virtual machines, not the user's Macs, iPhones or iPads.** They have no physical GPU or display, a different memory/thermal/pressure regime, and a simulator is not a device. The baseline is Windows Playwright WebKit measuring a different quantity. This is bounded regression evidence for the engine family, not device RAM certification or an operational budget.
- **Mobile Safari** became feasible after two fixes: launching Mobile Safari after `simctl boot`, and bounded session-creation retries. The first attempts failed on a safaridriver port race and on "waiting for its RWIApplication to appear".
- **Run 41659009592** produced no sessions: GitHub's macOS arm64 capacity cancelled jobs unacquired. The sessions now run one VM at a time.

## Review

The fresh reviewer's blocker was real: the parity step used `| tee` under a custom shell, which has no implicit pipefail. The logs of every earlier run show no traceback or AssertionError in that step, so the defect was latent. It is fixed with `set -o pipefail`.

The should-fixes were also fixed:

- `matches_reviewed_entry` now compares identity fields only, and its test covers committed entries with notes;
- the memory audit now requires a content process;
- the identity gate fails when nothing was compared;
- the docs state the write-token scope.

Nits addressed:

- `audit.json` is now written on structural failure;
- the WebDriver limitations are stated;
- the pin count is no longer hard-coded;
- the release-lock schema is checked;
- default lock paths are now relative to the script.

Not added: a dedicated unit test for `adoptionAudit`'s report mode. It was exercised by re-evaluating real evidence, and the results were identical.

## Reproduce

```text
node --test tests/*.test.mjs tests/adoption_acceptance/*.test.mjs tests/adoption_acceptance/oracle/*.test.mjs tests/safari_acceptance/*.test.mjs   # 81 pass
python -m unittest discover -s tests -t .                                    # 134 OK
python scripts/terrio_release_assets.py wheel --destination <new-dir>        # this platform's reviewed wheel
PMTILES_CLI=<go-pmtiles> python tests/terrio-publication.py <new-dir>         # in a GDAL env with the wheel
ENGINES=safari node tests/safari_acceptance/run.mjs <new-dir> && node tests/safari_acceptance/evaluate.mjs <new-dir>/raw.json safari
```

## Continuation

- **Decide on PR #6.** It is green except the Safari limit checks. Options: merge with the Safari results recorded as known exceedances, or keep it open pending a decision on h5wasm memory and first-render latency.
- **If Safari memory matters operationally:**
  - measure on the user's physical devices;
  - consider fresh-Safari-process-per-trial isolation as a *new, separately pre-declared* method;
  - investigate the cross-session WebContent residue.
- **Optional follow-ups:**
  - quantify the arm64 colourise difference (pipeline/numpy side);
  - digest-pin the manylinux images;
  - a release-profile build would be a new identity on every platform and would need fresh parity evidence.

## Final QAQC, corrections and merge (2026-11-03)

Independent final reviews by Muse Wonder and Claude Fable (read-only, fresh
clones of head `4a97204`) found no blockers. Both independently recomputed the
release-asset and wheel hashes, RECORD entries, per-platform native hashes and
the threshold derivation, and confirmed `thresholds.json` was committed
(`5eb0903`, 14:34:21Z) before the first macOS run (`41655030302`, 14:34:30Z)
and never changed. Local suites in their clones: Node 81 pass, Python 134 OK.

Fixed in `7f2648d` before merge:

- The `assets`, `native` and Safari session jobs (`contents: write` for
  draft-asset visibility) now check out with `persist-credentials: false`, so
  the write token is not left in `.git/config` for later unpinned
  npm/pip/micromamba steps. The `assets` and `native` jobs passed on all five
  platforms with this change.
- **Correction to this note:** the one-level RGB gradient difference is the GDAL
  reference moving, not a Terrio property. On identical colourised input the
  reviewed wheel's tiles are byte-stable and match GDAL 3.10.1 exactly, while
  GDAL 3.13.3's own tiles differ from 3.10.1's in all 17. The 72-archive pilot
  parity is parity with GDAL 3.13.3, a reference that drifts between releases.
- **Correction to this note:** the Safari attribution rule was broadened and
  hardened after the first run, never narrowed. It was not "unchanged".
- **Correction to this note:** the desktop Safari h5wasm "exceedance" is not a
  decoder finding. Path attribution sums WebContent processes that survive
  earlier WebDriver sessions, so the h5wasm overage and the terrio-slices pass
  are both measurement artifacts. Same-VM Playwright WebKit is the comparable
  control and passes. First-render timing fails on every macOS engine on
  GPU-less 3-vCPU VMs.

The owner accepted the Safari results for merge on 2026-11-03. The limits stay
as committed and the red Safari checks remain as the record. Any rerun needs a
replacement method declared before it runs. The post-fix Safari run
(`41688917660`) was cancelled while still queued for a macOS runner, to avoid
re-measuring a known result.

Merged: PR #6 -> `main` `ca6bbf37131a88d17e5584bb7c077e95e9378117`
(2026-11-03T18:10:35Z). The H: checkout was fast-forwarded to it.

Open follow-ups, none blocking:

- Pin actions by SHA and manylinux images by digest.
- Make the cross-platform identity gate separate pixel identity from
  geotransform last-ULP differences, declared before it runs.
- State in the guard docs that `require_terrio()` verifies hashes after import.
- Add branch protection on `main`; none exists.
- Use a fresh-process or physical-device Safari method if device acceptance is
  needed.
