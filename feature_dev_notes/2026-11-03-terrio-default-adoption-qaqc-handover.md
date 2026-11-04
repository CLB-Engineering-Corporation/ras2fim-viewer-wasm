# Terrio default adoption — final QAQC and handover

Completed 2026-11-03. This supersedes the experimental-only adoption decision in the November 2 handovers; those files and the original plan were preserved. The user explicitly authorized default promotion and normal CLB integration. All code/builds stayed in local worktrees. This final Markdown note is the only NAS write in this adoption continuation. No upstream PR/issue/comment/push, public application deployment, production release, force push or NAS source checkout update occurred.

## Final integrated state

| Repository | Integration | Exact remote main SHA |
|---|---|---|
| ras2fim-viewer-wasm | [CLB PR #5](https://github.com/CLB-Engineering-Corporation/ras2fim-viewer-wasm/pull/5), merged 2026-11-03T11:42:54Z | `6fe8713ed63d554cad80acab301bf2d8a8d975c9` |
| terrio | [CLB PR #32](https://github.com/CLB-Engineering-Corporation/terrio/pull/32), merged 2026-11-03T11:27:33Z | `72133fb5a0315268ce4683890c11f3e40840afd7` |
| clb_lwi_webmap | [CLB PR #3](https://github.com/CLB-Engineering-Corporation/clb_lwi_webmap/pull/3), merged 2026-11-03T10:26:52Z | `162419bbfbeb0935d56f7a59f2a0ed3cdf589827` |

Viewer and Terrio used merge commits, retaining feature/upstream ancestry. LWI used the normal squash merge. Feature branches and worktrees were preserved. No branch protections were bypassed. GitHub main tree equality was verified: viewer main and tested head share tree `680396f273073b97aa9d59ebc56a5bf2fc8b1476`; Terrio main and the immutable runtime pin share tree `2bce23348850c3e59311bb829fc765764e3f7ff5`.

Preserved delivery/worktree records:

- Viewer: `feat/terrio-default-adoption`, head `3509192f8d160590168a68e9ab9d707013c3002f`, at `D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102`. Remote/main is the merge SHA above; the local root main checkout was not rewritten.
- Terrio: `feat/clb-semantic-reconciliation-resume`, head/runtime source `9c644f4a1729e253f9714813912f54d32e306c38`, at `C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-5983c8e9`.
- LWI: `feat/terrio-supplied-cog-writer`, head `87bc6a83d78fe1726e2799d27f797c248ed6a68c`, at `D:/CLB-Dev/wt/clb-lwi-terrio-adoption-20261103`; own clone root `D:/CLB-Dev/clb-lwi-terrio-adoption-20261103`.
- Original bounded Terrio branch `feat/wasm-viewer-contributions` remains at `788257207f094d6f7c1807f6e3cef764a43575e6`. The old conflicted `t3-9ebd6658` merge remains untouched; do not resume it over the integrated semantic branch.
- Earlier experimental viewer branch remains preserved. Local untracked session-state files, ignored validation data/builds and producer worktrees were not deleted.

The NAS viewer source working tree is intentionally unchanged. Defaults described here are on the remote CLB main branches and in the local delivery worktree. Existing public Pages still publishes `gh-pages`, not `main`; latest observed Pages build remained commit `473ad4d83add89d3f3e7289f671a1f23a307f2d3`, created 2026-09-25T17:23:15Z. No Pages/deployment branch or service was changed.

## Actual defaults and ownership

- A normal `pipeline.fim2d.site` build selects the pinned Terrio package; the catalog selects `terrio-slices`. Missing/altered required bytes stop the build before output replacement. There is no silent h5wasm fallback.
- One worker/module is retained per page session. Loads abort prior fetches, supersede generations and preserve a predecessor barrier even when an intervening request fails. Decode is serialized; stale returned datasets are disposed before the next decode. Preparation yields between layers. Dataset/view and verification state are released on done/error/cancel. Sparse buffers transfer; dense arrays stay worker-local. A crashed worker is replaced on the next selection, with old-instance messages ignored.
- Synchronous native decode/preparation cannot be interrupted within a task. Preparation cancellation tests use a barrier before preparation and normal task boundaries; they do not demonstrate intra-task preemption.
- `pipeline.fim1d.depth_pmtiles` defaults to Terrio with the demonstrated BILINEAR base/AVERAGE overview policy. All-dry archives retain the valid transparent-z0 sentinel, explicit empty metadata/manifest flag, source bounds and atomic publication rules.
- `pipeline.fim1d.cogs` defaults to Terrio only for writing the existing supplied area/mode arrays. State Plane/WGS84 warping, exact extrema, wet/dry interpretation and area-matched/mode calculations remain authoritative GDAL/pipeline operations. The generic `finish_cog` helper retains GDAL as its default for existing external callers and other overview methods; explicit Terrio selection requires supported supplied arrays.
- LWI's optional generic hook is integrated while its existing production defaults, Louisiana envelope, metadata prefix and geodesy behavior are preserved. No LWI dependency/default/service deployment was changed.
- The native publication guard verifies all locked Python files and the actual loaded `terrio._terrio` origin, rejects competing ABI-qualified artifacts, and wraps missing/DLL/ABI import failures with actionable fallback guidance.

Explicit reference/rollback controls:

```text
pipeline.fim2d.site ... --reader-backend h5wasm
viewer URL: ?decoder=h5wasm
pipeline.fim1d.depth_pmtiles ... --backend gdal
pipeline.fim1d.cogs ... --writer-backend gdal
```

`--terrio-package PATH` remains a deliberate local development override with `local-override` provenance, not a reviewed-pin claim. Unknown backend selections fail. Existing output replacement remains staged/atomic. Reverting adoption should use a new reviewed revert PR for viewer merge `6fe8713`, preserving prior artifacts and fallback controls; do not reset/force-push main or overwrite artifact locks.

## Immutable runtime and actual release artifacts

Runtime source is `9c644f4a1729e253f9714813912f54d32e306c38`, now an ancestor of Terrio main. No newer upstream catch-up was added. Existing upstream PRs #503/#504 were untouched.

Web package: `t3-5983c8e9/js/pkg-viewer-final`, target web, single-threaded, features `netcdf-hdf5` only. WASM is 14,376,789 bytes (gzip level9/mtime0: 5,233,091 bytes), SHA256 `e9f0a57ce955b71a74779cac9da73e176926f31a6ba442d569923b228316ebd5`. No shared-memory headers are required. Preserve all eight locked assets, both declarations and three license/notice files; this build generated no snippets. Future builds must inventory snippets when generated.

Draft artifact channel: `CLB-Engineering-Corporation/ras2fim-viewer-wasm`, tag `viewer-runtime-9c644f4`, release database ID `432562752`, target commit `9f1dd36d5af695135679fe38ea550aed5882a4d0`. Authenticated `gh release view/download` by tag is the stable acquisition interface; GitHub's draft `untagged-*` browser URLs can change when notes are edited. These remain draft preparation artifacts, not a public production release.

| Artifact | Bytes | SHA256 | GitHub asset API ID |
|---|---:|---|---:|
| `terrio-viewer-runtime-9c644f4.zip` | 171643130 | `5eb50b10bd4f3bf0f39423834d8428b64388d9a893165c36dc3f0327ecaadae6` | 705234738 |
| `terrio-0.6.1+clb9c644f4.1-cp310-abi3-win_amd64.whl` | 156287240 | `c40983634cc8f27f86135572722ed0f67193b67f8d18ae09e38cda2a814ba346` | 705274190 |

Stable asset API locations are `https://api.github.com/repos/CLB-Engineering-Corporation/ras2fim-viewer-wasm/releases/assets/<ID>` with appropriate draft access. Actual metadata receipt: `.terrio-validation/adoption-release-receipt-r1.json`. Local assets remain under `.terrio-validation/release/` in the viewer worktree. No binary/private data was committed or written to NAS.

The bundle's externally pinned digest, complete manifest and inner web/native locks are verified before safe staged extraction and cache import. Path traversal, case aliases, ADS/drive names, symlinks/special entries, unsupported codecs/encryption and expansion caps are checked. Extraction caps reflect actual payloads, not an invented product RAM budget. Existing destinations are refused. A later importer failure may leave already verified directories for inspection.

The wheel wraps the reviewed native binary without recompiling; source uses PyO3 `abi3-py310`. It contains complete RECORD hashes and all three license/notice files. Revision `.1` corrects License-File paths relative to `.dist-info/licenses/` per the wheel specification. Native/Python executable bytes are unchanged. The unrevisioned wheel (asset705234736, SHA `dcb10acf2ba5158664b952c263a4befb3ea8b8ab43906804b1c4729c334a1ac8`) is preserved solely as superseded audit evidence; do not install it. No asset was clobbered.

Fresh authenticated download, an empty cache import, default-site build and deep validation passed. Native installation was tested in isolated environments without modifying global/conda environments. The Windows fim1d dependency is pinned to local version `0.6.1+clb9c644f4.1`, intentionally absent from PyPI; install the reviewed wheel before resolving that group. Other native platforms require their own reviewed artifact/lock or explicit GDAL controls. Browser WASM is independent of that native platform limitation.

## CI and independent review

All seven checks passed on viewer head3509192. Main's post-merge six-check tests workflow also passed: run `41629752287` at main6fe8713. Head tests run `41625174793` and pinned-runtime run `41625174792` are preserved as linked GitHub evidence.

- Node20/22 tests: 76 passed. Python3.11/3.12 pipeline suite: 122 tests after the codec-bound regression additions. Bare-cache roundtrip tests explicitly use h5wasm; the separate required assets job still builds the Terrio default.
- Fresh Linux default asset acquisition and tiny site validation: 40 checks, zero failures/warnings. Real three-stream local package validation: 76 checks. Conventions:141 checks.
- Draft acquisition initially failed with a read-only token. Only the dedicated assets job now requests an ephemeral `contents: write` token for GitHub draft visibility; other jobs remain read-only. No persistent OAuth token was copied to secrets. Fork PR tokens retain GitHub's read-only restriction and cannot bypass the required gate. Actual successful CI proves this channel, not merely local OAuth access.
- The Terrio fork's own Actions are suppressed by GitHub due to usage scale. Repository/workflow enable API calls did not clear dispatch422. The signed-out shared browser exposed the exact usage-suppression banner but could not perform the maintainer-only control. Rather than bypass CI, the viewer's read-only workflow checks out and verifies exact source9c644f4, with Cargo jobs2/debug0.
- That real remote runtime job passed format, workspace/all-target Clippy1.99.1 with warnings denied, 1,887 workspace unit tests (29 ignored), Rust1.90 workspace/all-target compilation and REUSE3.3 compliance. Its successful run was posted as the explicitly named external status `CLB pinned-runtime QAQC` on source9c644f4, linking the real job, before the normal Terrio merge. The initial attempt to combine Clippy1.90 with MSRV testing failed older lint diagnostics; no algorithm/lint suppression was used. Compatibility and current lint checks are separate.
- Earlier same-pin local Windows evidence remains valid:1790 unit tests/28 ignored, Clippy, format, 1152 typed/unified streamed-versus-whole configurations, optimized scientific WASM and browser numeric/ownership checks. Platform/configuration counts are recorded separately, not conflated.

Fresh independent reviews covered lifecycle races, actual native identity, immutable executable closure, asset/ZIP/wheel metadata, CI credentials/default gates and completed long evidence. Fixed findings include the failed-middle-request barrier, an accidental regex backspace disabling verification, counting MapLibre workers as decoder workers, missing decoder-JS pins, draft-access provisioning and license metadata paths. The final codec-bound weakness was tightened to exclude nodata magnitude and assert masks separately. No actionable review finding remains for this accepted scope.

## Completed browser acceptance

Local evidence root: `D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102/.terrio-validation/`.

Long report `adoption-long-fixed/raw.json` completed after cleanup, 2026-11-03T10:20:54.967Z→11:20:07.928Z. Engines: Chromium156.0.8078.4, Firefox157.0, WebKit27.2 on Windows. Three trials ×80 switches per decoder/engine; each session also exercises20 cases of each fetch-cancel, preparation-cancel and malformed recovery scenario.

Exact audited totals:1440 regular switches,4320 slider renders,1080 uniquely keyed recoveries,36 cold/warm renders,360 dry frames,1440 RSS endpoints and18 context-close records. Error arrays are empty. Four inputs per engine independently compare h5wasm/Terrio native typed values, metadata, sparse data and RGBA. Worker/module identities remain stable within each session, with one creation/initialization, one live worker and zero tracked handles after decoding/recovery. Failed generations never appear in recovery paint records. No dense arrays cross the worker/main contract.

The producer audit, coordinator re-audit and independent read-only reviewer audit exactly agree. `adoption-long-fixed/audit.json` contains the accepted results. Thresholds were derived before execution from hash-verified historical reports in `tests/adoption_acceptance/baseline.json`: timing p95×1.5+100ms; sampled working-set maximum×1.25+128MiB, using the historical long WebKit baseline for that engine. No limit was relaxed in response to this run.

| Terrio long-run engine | Sampled maximum MiB | Relative regression limit MiB |
|---|---:|---:|
| Chromium |709.4|894.3|
| Firefox |1293.1|1572.1|
| WebKit |1637.0|1869.1|

This is finite measured-baseline acceptance, not an operational RAM budget or evidence of absolute memory reduction. Browser-descendant sums may double-count shared pages; endpoints are not private heap/true peaks, and module capacity is recorded separately. One-off artifact repacking/installation/publication checks and light administration occurred during the hour-long run; no heavy local Rust build ran. A separate quiet timing job followed those activities without builds/bundling/other browser work.

Quiet report `adoption-quiet/raw.json` completed 2026-11-03T11:25:00.271Z→11:28:46.947Z and passed the ordinary all-engine audit. It has72 switches,216 slider renders,36 cold/warm samples and18 dry frames, with zero errors. Cold means a fresh context, not restarted browser/empty OS caches. Fixed decoder order, three first-render samples per phase and shared browser compilation caches limit interpretation. Long-run independent preflight can warm browser-wide code caches; quiet timing uses the legacy measurement path without that preflight. Both describe completed MapLibre depth renders, not physical display timing.

Quiet median/p95 milliseconds, h5wasm reference versus Terrio slices:

| Engine | First cold h5 / Terrio | First warm h5 / Terrio | Slider h5 / Terrio |
|---|---|---|---|
| Chromium |756.1/819.9 ;502.3/644.2|598.8/748.4 ;369.1/405.0|219.15/250.4 ;217.8/245.1|
| Firefox |484/767 ;464/478|430/524 ;312/404|238/277 ;238.5/269|
| WebKit |380/481 ;373/379|409/425 ;360/376|216.5/247 ;211/249|

These are bounded observations, not a universal speed claim. Slider timing includes the existing dissolve. The local interactive report `adoption-report.html` was previewed at728px/390px without console errors.

Shared-browser acceptance used the actual packaged site at localhost8133, `?verify=1` with no decoder override, real Esri imagery and `document.hidden=false`. T3's Chromium152/Electron44 browser visibly rendered the small depth stack and both real WSEL stacks. Native slider Home/End changed counts, playback advanced/stopped, stream switching completed, signed negative statistics remained visible, and no console/network errors were recorded during the default session. The server log proves Terrio module/WASM loads before any h5wasm load; h5wasm was loaded only on a later explicit fallback URL. The fallback rendered matching initial counts/statistics. Tabs/server were closed/stopped afterward.

Evidence: `adoption-visible-proof.json`, `adoption-visible-fallback.json`, `visible/default-server-before-fallback.log`, `visible/default-depth-high.png`, `visible/default-wsel-high.png`. Screenshots are qualitative QA, not physical-display latency or independent pixel oracles. The same corpus also has the independent numeric/RGBA/long-run gates above.

## Native publication and scientific checks

Revised wheel guard/install plus native multidimensional/ownership tests passed in Python3.10.22,3.11.13 and3.13.5 (four focused tests each). Python3.12.14 performed actual GDAL3.13.3 publication. Python3.10 is a native library ABI test only; the viewer pipeline minimum remains3.11. Isolated environments and freezes: `wheel-py310`, `wheel-py311`, `wheel-py313`, `adoption-wheel-env`; logs `adoption-wheel-py31*.log` and corresponding freeze files. These are not certification of every compatible interpreter/platform.

- `adoption-wheel-publication.log`: installed-artifact synthetic archive/codec/atomicity checks pass.
- `adoption-wheel-corpus.log`: all72 existing retained real archives exact across all RGBA channels, coverage, bounds and zooms. This is a saved-corpus recheck, not a claim of72 new builds during adoption. The pin's final original corpus generation remains documented in the November2 handover and Terrio evidence directory.
- `adoption-wheel-r1-default.log`: actual backend-omitted default dispatch rebuilt a real13-tile PMTiles profile exactly against GDAL. It also called the COG pipeline with backend omitted and confirmed Terrio provenance.
- The COG test captures the exact staged/supplied base/overview arrays and requires them to match between writers. Each lossy output is compared to its exact inputs with unchanged0.01 bound plus one valid-depth Float32 ULP; nodata is tested separately. Observed errors were0,0.0100002288818,0.0100002288818,0.0099940299988, within0.0100019073486. Pairwise valid lossy outputs differed up to0.0199875832 in overviews; this is explicitly reported, not claimed exact or used to weaken either source-relative bound. DEFLATE comparison remains exact.
- Real independent COG layout/metadata/georeferencing/nodata, supplied-overview policy, exact extrema, dry/wet behavior and injected-failure preservation retain the pinned-runtime evidence described in the earlier handover. No COG area algorithm or State Plane warp was replaced.

The owned-input allocation benchmark remains snapshot-specific native requested-heap accounting (18 runs, about one third additional peak removed), not browser RSS. One redundant Vec clone is removed; dependency Vec→Arc copying remains. Lazy selected-read byte measurements are native/storage observations; browser scientific files still download whole. No speculative range API was added.

## Evidence hashes and reproduction

| File (under viewer validation root) | SHA256 |
|---|---|
| adoption-long-fixed/raw.json |746435ed461dace70a87cb9dd09b0d65ef0c4d57e2fdfbc01c5961a0ea722c6f|
| adoption-long-fixed/audit.json |c7998fcbf020554b85e3db0b6b8c761a1cbbad470b3f4472577398147bc170c2|
| adoption-quiet/raw.json |d1508e8399861e3ac67d7213a85216d3b1d0a5f3e8904e6b91108ebee28e62cc|
| adoption-quiet/raw.summary.json |0833afd5d03f2643610136049d894739da87fd0f7b974520b60e93160e2dbcc5|
| adoption-visible-proof.json |874449d5f415d526d55fcbaa8610053deb365a5f2ea8d2739486e336fef13153|

`adoption-pins.json` independently freezes all seven executable dependencies (application, reader, worker, adapter, TerrioJS/WASM and h5wasm). All match the staged site and accepted report. Browser code is unchanged from run headb7391e9 through tested3509192 and the main merge; later commits concern tests/docs/release/CI. Five legacy quiet-report pins are supplemented by the same seven-file package record and full locked inventory. Failed/incomplete earlier smoke/long reports remain preserved and are not passes.

From the local viewer worktree:

```text
node --test tests/*.test.mjs tests/adoption_acceptance/*.test.mjs tests/adoption_acceptance/oracle/*.test.mjs
python -m unittest discover -s tests -t .
python -m pipeline.check_conventions
node tests/adoption_acceptance/audit.mjs .terrio-validation/adoption-long-fixed/raw.json tests/adoption_acceptance/baseline.json .terrio-validation/adoption-pins.json
node tests/viewer_acceptance/audit.mjs .terrio-validation/adoption-quiet/raw.json
python scripts/terrio_release_assets.py acquire --sha256 5eb50b10bd4f3bf0f39423834d8428b64388d9a893165c36dc3f0327ecaadae6 --destination <new-local-directory>
```

For new browser reproduction use the acceptance READMEs, independently freeze candidate pins and a fresh output directory; do not overwrite evidence. `ADOPTION_SITE`/`ACCEPTANCE_SITE` select the packaged site. Playwright module remains at primary Terrio worktree `target/validation-tools/node_modules/playwright`. All tests are local/CLI; no deployment is necessary. Use modern lwi-gdal3.13.3 for publication and the reviewed native wheel, not an arbitrary same-version PyPI binary. `tests/terrio-default-publication.py` exercises omitted-backend defaults. Original core build targets remain separate, with Cargo jobs2/debug0. Do not rerun unrelated heavy builds when source/features/settings are unchanged.

## Remaining limits and continuation

Default adoption is complete for the verified paths and bounded evidence. Actual Safari/target-device RAM/session certification was not available and is not claimed. There is no agreed operational RAM budget, no proof of leak freedom or unbounded plateau, no general GDAL equivalence outside the tested kernels/corpus, and no universal native wheel. Synchronous task preemption, scientific remote ranges, broad COG algorithm replacement and public deployment remain outside this implementation. Explicit reference controls remain useful for unsupported environments.

For future core work, an authenticated maintainer can re-enable the Terrio fork's usage-suppressed Actions UI; API attempts were insufficient. Current adoption is validated by the actual alternate pinned-source CI job and honest external status, not a missing-check exemption. Update the pin/workflow/locks together for future runtime changes, with fresh artifact review and exact/numeric/lifecycle gates. Do not catch up upstream opportunistically or communicate upstream without new authorization.

Keep draft artifacts accessible to the CI acquisition channel. Removing/changing them breaks fail-closed default builds. Any changed executable or packaging artifact needs a new identity/digest and verification; never silently replace bytes behind an existing lock. Retain prior assets/branches for rollback. NAS source remains untouched by design; update that checkout only under separate authorization consistent with the user's storage restriction.
