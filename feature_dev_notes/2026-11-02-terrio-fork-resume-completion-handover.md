# Terrio fork and viewer resume — completion handover

Date: 2026-11-02 America/New_York; final measurements continued through 2026-11-03 02:14 UTC. This supplements, rather than replaces, the two earlier Terrio handovers and the read-only implementation plan.

## Delivery and authorization boundary

All implementation is on CLB feature branches. No main merge, release, production deployment, new upstream publication, or modification of upstream PRs #503/#504 occurred during this continuation. Those PRs were left alone as instructed. NAS code was not edited. This Markdown handover is the only final NAS write; source, private data, wheels, archives and build evidence remain in local worktrees. Defaults remain h5wasm and GDAL; this is a verified experimental integration, not an unconditional viewer migration.

Verified remote heads (ordinary pushes, no force pushes):

| Repository / branch | Exact head | Local worktree |
|---|---|---|
| CLB terrio / feat/wasm-viewer-contributions | 788257207f094d6f7c1807f6e3cef764a43575e6 | C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions |
| CLB terrio / feat/clb-semantic-reconciliation-resume | 9c644f4a1729e253f9714813912f54d32e306c38 | C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-5983c8e9 |
| CLB ras2fim-viewer-wasm / feat/terrio-experimental-backends | 201c415fe5c085224cc9f4eea0e162c685e17b47 | D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102 |

Origins: https://github.com/CLB-Engineering-Corporation/terrio.git and https://github.com/CLB-Engineering-Corporation/ras2fim-viewer-wasm.git. Remote heads were checked with git ls-remote. No PR was created for these delivery branches.

Original CLB main 3ad8f58fee877e59a61c5d14d1afec311c76b8f4 remains unchanged. Semantic reconciliation includes upstream snapshot 764be49a74468a512b190e432e7084fab54eecae on a feature branch only. It does not claim to track future upstream changes.

## Independently reviewable contribution units

A — scientific selective WASM packaging: locked --no-default-features / --features builds produce one module, retain declarations, snippets when generated, notices and licenses, reject stale output, and omit unavailable variant exports. Standard variants/default exports and wasm64 implementation were preserved. Qualified terrio-js/threads cannot bypass thread orchestration validation. Eight packaging regressions are wired into CI. Recipe: docs/scientific-wasm-build.md. No gratuitous default export expansion.

C — owned multidimensional input: open_bytes_owned(Vec<u8>) preserves the borrowed API and driver allowlists; both JS byte-input forms use it. Safe HDF5 userblock offsets and an independently producer-written fixture are covered. Views retain source ownership; typed output arrays remain JS-owned copies. One redundant payload Vec clone is removed. The dependency still copies Vec into Arc<[u8]>; this is not zero-copy JS input.

B — scientific browser/worker conformance: exact packed/chunked numeric values, Int64/UInt64 limits, fill, NaN/Infinity, metadata, malformed inputs, ownership after ancestor disposal, memory growth, copied arrays and transferred worker output. Test ownership was corrected so sibling handles cannot mask a child retention defect. No flood-specific Rust API or new speculative range API was introduced.

D — demonstrated tile compatibility: OVERVIEW_RESAMPLING changes only overview choice, retaining existing defaults and base resampling. Fractional footprint AVERAGE, binary nonzero-alpha validity and GDAL accumulation order now match the independent reference. Final base-tile correction uses Float64 only for tile NaN color staging before Byte output, avoiding spurious intermediate Float32 rounding. Generic scientific warp precision is unchanged. Both eager and streamed paths agree.

These are local/fork review units for future packaging, not permission to submit upstream. Upstream-derived A/B/C backing branches and existing upstream PRs must remain untouched unless the user changes scope again.

## Semantic reconciliation and dependency order

Worker semantic merge f88347f0908ee15d890d477ec5e629d995498272 reconciled upstream 764be49 with CLB changes. Coordinator integration cbfd7e32d6f526817b8b783ed43a13c8c0cc18d9 retained the earlier RGB fix and added typed/unified streamed regressions and clarified overview docs. Final RGB commit 9ebd82fa66789de5b3ebec55b6537f10de7de91d was integrated, followed by reference-label correction 9c644f4.

Retained policies: bounded RowWarp slab emission and gap filling, source masks and global validity, source-order accumulation, typed sink/nodata avoidance, supplied overview arrays, area reports, explicit factor validation and LERC edges. SOURCE automatic unmasked reductions use original source blocks with ceil sizing; explicit factors use recursive ceil sizing. Masked nearest/average/mode remain recursive weighted SOURCE paths; masked min/max are rejected. GDAL_3_13 is a distinct opt-in recursive/floor policy. Do not collapse these branches with ours/theirs resolution.

The previous conflicted worktree t3-9ebd6658 (feat/clb-upstream-reconciliation-20261102, HEAD 83faa7b, MERGE_HEAD a2a359a, 28 conflicts) was preserved untouched. Do not resume that obsolete merge over the verified semantic branch.

## Viewer implementation

- Experimental Terrio adapter preserves readStack native/metadata contracts; bounded iselAxis(0) slices feed the same layer preparation path. Reader stays DOM-free. Whole files are still downloaded; selection is bounded decode, not scientific HTTP range access.
- Worker epochs, cancellation, supersession, fetch/init/decode/prepare errors, task yields and explicit handle disposal are covered. No silent fallback on malformed input.
- Dense/sparse display disagreement was traced to Float32 display-bin boundaries. Math.fround establishes the existing sparse Float32 display contract while native packed values and signed statistics remain unchanged. Exact RGBA comparisons were retained; no tolerance was added to hide a ramp change.
- --terrio-package explicitly copies required module/WASM/declarations/notices/snippets and provenance. Validation requires a complete asset hash inventory, safe relative paths, containment and valid schema; empty/omitted inventories cannot bypass checks.
- Reused COG extrema use exact base-resolution ComputeRasterMinMax(False). All-invalid data uses a verified block scan and deliberate zero normalization bound; read failures do not become empty data.
- Opt-in direct PMTiles uses the matched base BILINEAR and overview AVERAGE policies. Header zoom policy follows reopened GDAL MBTiles levels.
- All-dry publication is deliberate: a valid transparent z0 PNG sentinel, empty metadata and manifest depth_empty flag, source bounds and zero maximum. Python pmtiles is declared and preflighted. Go's independent PMTiles verifier accepts the archive. Archive and manifest publication preserve previous artifacts atomically on injected failures. Browser wet → dry → wet removes painted depth, then restores it without accumulating sources.
- Known empty archives cannot be published under a missing/false empty flag or positive maximum. Directory/payload/metadata/section checks reject malformed sentinels.
- finish_cog(writer_backend='terrio') remains a writer-only trial. Existing finish_cog supplied area/mode overview arrays, metadata, bounds, independent validation and atomic replacement remain authoritative. No area algorithm was substituted. GDAL is default.
- The optional vendored generic writer hook must be coordinated with clb_lwi_webmap before production adoption. No edits to that other repo were made. Preserve documented pre-existing envelope/prefix divergences.

## Final source and artifact pins

Final minimal web package: t3-5983c8e9/js/pkg-viewer-final, source 9c644f4, features netcdf-hdf5 only.

- terrio_bg.wasm: 14,376,789 bytes; gzip level 9, mtime=0: 5,233,091 bytes.
- WASM SHA256: e9f0a57ce955b71a74779cac9da73e176926f31a6ba442d569923b228316ebd5.
- Final CLI SHA256: 82A563621E57D23DBC1DFABFBD50BA69A3D209C4D92661B2349247EFC0A6A56C.
- Final Python extension SHA256: 9CE8973A9420707D94694F5F02DF92FFAED19D7AD50C52692774AE26EC8A14D3.
- Nine npm pack entries include both declarations and licenses/notices. No snippets were generated for this feature set; packaging retains snippets when present. Site carries eight required package assets plus provenance (npm README is not a runtime requirement).

Final viewer site: D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102/.terrio-validation/pilot-site-final. Binaries/private inputs are not committed. Raw reports pin actual served app/reader/worker/adapter/WASM bytes. Viewer e8450f0 was the final measurement source; later 3ea5858/201c415 change audit/profile/documentation, not measured application or WASM bytes.

Tools: rustc 1.99.1 (58cf8f9c3 2026-10-13), Rust 1.90.0 MSRV check, Node 22.17.1, wasm-pack 0.15.0, GDAL 3.13.3 (3130300, Iowa City, released 2026/08/13). The reference is 3.13.3, not 3.13.0. Python environments are intentionally separated: plain Anaconda Python 3.13 has netCDF4/full viewer suite; lwi-gdal has modern GDAL and final Terrio runtime. Local directory py311 actually supplies Python 3.12 dependencies; do not infer interpreter version from its name. This is a recorded workstation build, not a hermetic build claim.

Private NC input pins (all under viewer .terrio-validation/pilot):

| File | Bytes | SHA256 |
|---|---:|---|
| filter_depth_wb-2427467.nc | 118935 | cfcacf5b32fc8f8ae7b1edbf63f7133de58e890350bfb2359123a797b789dae6 |
| filter_wsel_wb-2427466.nc | 2353803 | 0704adae7086e00aad4b32b296d99a7562e48a61c9b3532055e5fd6b75c6e28f |
| filter_wsel_wb-2427467.nc | 71777 | d43106c65d2147763910e55d4589fc2a147302ffe402b94ae19c9cab3ad97183 |

## Final checks and preserved evidence

Terrio evidence root: t3-5983c8e9/target-clb-semantic/evidence/.

| Check | Actual result | Evidence |
|---|---|---|
| Workspace unit tests | 1790 passed, 28 ignored, 0 failed | workspace-final.log |
| Tile tests | 58 passed, 1 ignored | tiles-final.log |
| Workspace Clippy/all targets -D warnings, fmt, fork-delta pre-commit | passed | precommit-final.log |
| Rust 1.90 workspace/all-target check | passed | msrv-final.log |
| Typed/unified streamed vs whole | 1152 configurations, passed | typed-unified-slab.log |
| Final Python runtime | 15 passed, 3 external-data skips | python-final-runtime.log |
| Registered GDAL tile comparisons | 8/8 identical | conformance-final.log/.json/.md |
| Synthetic exact RGBA | 4 fixtures, base and pyramids | rgba-final.log |
| Real exact RGBA/headers | 72 unique profiles, zero differences | corpus-final.log, corpus-integrated-results.json |
| Optimized scientific WASM | passed, wasm-opt complete | wasm-viewer-final-build.log |
| Chromium/Firefox/WebKit scientific values/ownership/growth | all passed, 6 worker cycles each | wasm-viewer-final-browser.log |
| Actual npm contents | passed | npm-viewer-final.json, viewer-package-final.json |

The 72-profile comparison checks all RGBA channels, not merely visible RGB, plus bounds/zooms/coverage; exact library maximum is 31.83563232421875. Strict reproduction scripts now assert 72 unique profiles and fail on mismatches. Final correction was independently reviewed with no actionable findings. Historical pre-fix rgba-integrated.log failures are preserved and superseded, not current blockers.

Worker reconciliation evidence additionally records 487 driver tests, 13 raster-management tests and Python 272 passed/5 skipped/19 XPASS on f88347f, before final RGB integration. These are not mislabeled as final-head reruns. Imported-upstream full pre-commit has 117 existing issues; fork-delta checks passed. Older GDAL 3.10 COG-layout skips are supplemented by modern 3.13.3 comparisons. Version-gated tile oracle correctly skips under CI GDAL 3.12.2.

Viewer evidence root: D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102/.terrio-validation/.

- unit-final-delivery.log: 104 Python tests passed; node-final-delivery.log: 59 Node tests passed; conventions-final.log: 139 checks passed, zero warnings/failures. Changed-file pre-commit passed. Final doc-only correction also passed copied-config hooks; direct cross-drive config invocation was rejected by pre-commit and retried with the identical config copied to ignored local validation storage.
- pilot-site-final-validate.log: 75 checks, zero failures/warnings.
- differential-final-fixtures.json: 10 fixtures, 46 records, 36 worker cycles, 4 expected malformed-layout/input rejections; native/metadata/statistics/sparse/RGBA checks preserved.
- differential-final-pilot.json: 3 real NC files, 21 records, 18 worker cycles, no rejections.
- worker-lifecycle-final.log: injected prepare/decode failures and supersession leave live handles zero; fetch/init allocate no handles.
- empty-publication-final.log and empty-browser-final.log: deep validation 38 checks, wet/dry/wet in all 3 engines, dry painted pixels zero, wet restored, one active depth source.
- reconciled-publication.log: 5 EPSG:3857 fixtures including dry, exact archive/header comparison; DEFLATE exact, LERC bounded; georeferencing/metadata/nodata and failure atomicity passed.
- reconciled-cog.log: real WGS84 depth profile supplied-overview output, metadata/georeferencing/nodata/layout passed. LERC observed max errors [0, 0.0100002288818, 0.0100002288818, 0.009994029999], within nominal 0.01 plus one Float32 ULP (0.0100019073486). This is bounded lossy agreement, not exact pixels.
- Earlier real 1D deep baseline: 958 checks passed. Existing nonmonotonic reach 5789842 warning is retained, not suppressed.

## Allocation and I/O measurements

Native allocation benchmark at c6e892781e1f0a14954b18d5eb860b1cfc167fee used 18 fresh-process runs. Additional requested Rust heap peak fell about one third: classic 201326848→134217904 bytes for 67108944-byte input; HDF 603994834→402663229 for 201331605-byte input; userblock 603995346→402664253 for 201332117-byte input. Raw methodology/results: t3-b4f8df7e/crates/terrio/examples/owned_bytes_benchmark.md. These are native allocator accounting, not browser RSS/private heap. Dependency Vec→Arc copying remains; userblock retained-prefix overhead was 552 bytes.

Selected read test: metadata 19144 bytes, selected read 121696 vs whole array 4313952, file 4322152. Browser still fetches entire NC. Tile F64 staging doubles temporary masked color sample width from 4 to 8 bytes; native reads remain windowed and accounting uses declared type. Peak RSS/remote transfer effects of that tile change were not measured separately.

## Browser render and retention acceptance

Harness: tests/viewer_acceptance/. No routing disables cache; same-origin basemap isolates depth rendering. All ordinary console/page/request/HTTP/MapLibre errors fail. Audit validates exact engine set, unique samples, intended stream rotation, slider bounds, event timestamp/generation/revision, per-cycle RSS and recomputes summaries. completed:true is written only after successful cleanup. The named single-engine --webkit-stress profile cannot replace the default all-engine audit.

Final quiet run: render-final-pin-quiet/{raw.json,raw.summary.json}; SHA256 raw 30d6d0bdf196e6e339ed47b8acd3b9b2e1edc6046aca61af39f3cfd84a4608d5. Completed 2026-11-03T02:04:53.849Z→02:08:41.549Z, source e8450f0, final E9 WASM. Three trials, four cycles, two decoders, three engines: 72 switches, 216 slider renders, 36 cold/warm first-render samples, 18 dry renders, 72 RSS endpoints, zero recorded errors. No concurrent heavy builds. Cold is fresh context, warm the next navigation with HTTP cache enabled; not empty OS caches or restarted browser. Fixed decoder order; only three first samples per phase.

Median / p95 first render milliseconds:

| Engine | h5wasm cold | Terrio cold | h5wasm warm | Terrio warm |
|---|---|---|---|---|
| Chromium | 784.3 / 794.2 | 506.3 / 511.9 | 705.1 / 711.3 | 396.7 / 419.0 |
| Firefox | 682 / 971 | 522 / 636 | 468 / 1172 | 345 / 798 |
| WebKit | 447 / 468 | 411 / 492 | 375 / 393 | 362 / 446 |

These are headless completed MapLibre depth-render events, not physical display timing or a universal speed claim. Slider medians stayed approximately 212–241 ms under the existing dissolve. Raw reports retain all samples and p95, not just selected statistics.

Final WebKit stress: render-final-pin-long-webkit/{raw.json,raw.summary.json}; raw SHA256 2a18e608e068a7693e6c54f313e673a12210047d65556367e75881ed89579a4c. Completed 02:08:41.961Z→02:14:54.810Z. Each decoder: 80 switches and 240 slider renders; total 160 switches, 480 sliders, 40 dry renders, 160 RSS endpoints, zero errors. Named bounded-webkit-stress audit passed. Per-stream logical caches remained stable (small 712912 bytes/18 layers; large 20156896/15; receding 6128/3; one worker). Sampled browser-descendant working-set maxima h5wasm 1263.0 MiB / Terrio 1392.9 MiB; one-second post-context-close endpoints 130.8 / 150.9 MiB. Matched small-stream checkpoints rose with occasional within-context drops; this does not identify GC/JIT/allocator causes or establish an unrestricted plateau.

Archived earlier all-engine long run render-acceptance-completed has 360 switches, 1080 sliders, 36 first renders and 90 dry frames, zero errors. It uses older DD196F4B... WASM from 7f09be44, not final E9; do not combine its performance as if pins matched. Earlier incomplete/error runs remain preserved and are not passes.

Controlled diagnostic: tests/viewer_retention_diagnostics/. Producer t3-0a692b73 retained 280 operations across WebKit/Chromium reuse-decode, fresh-init and fresh-decode controls. Final-pin repeat retention-final-pin-frozen/raw.json completed 120 WebKit operations, SHA256 d4eb5096c83096abaa7c053add42fa3ff847e313eb9fe6053b52b26d543a1c89, exact frozen worker/module pins. Fresh initialization without file open/decode reproduces engine-dependent growth; reused-worker control stays stable; context close releases elevated working set. Input is still cloned per request, including init-only: no claim of zero input allocation. No forced GC. Diagnostic conclusions and RSS sums/pins were independently reviewed. No worker-reuse product patch was implemented or adopted; adoption needs lifecycle/cancellation/failure/concurrency validation, not another user-permission gate.

All RSS values are endpoint summed working sets of browser process descendants, may double count shared pages, and are neither private heap nor true peaks nor proof of leak freedom. WASM capacity is separately reported. Windows WebKit does not certify Safari on a target device. No agreed operational RAM budget or unbounded session acceptance was established, so defaults remain unchanged.

Interactive local report: .terrio-validation/acceptance-report.html (final quiet timings and matched WebKit checkpoints). Rendered at desktop/mobile sizes with no console errors; generated evidence is intentionally not committed.

## Reproduction and continuation

Use local worktrees and preserve separate disk targets. Set CARGO_PROFILE_DEV_DEBUG=0, CARGO_PROFILE_TEST_DEBUG=0, CARGO_BUILD_JOBS=2; use target-clb-semantic for final Terrio and coordinate load. Do not delete the older producer targets or conflicted checkout.

Terrio commands: cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings; cargo test --workspace --lib; cargo +1.90.0 check --workspace --all-targets --offline. Feature/build specifics and real packaging commands are in docs/scientific-wasm-build.md and preserved build logs. Final optimized package was built via js/build.mjs using netcdf-hdf5 only; npm pack --dry-run --json was inspected. Use the existing script help for argument spelling rather than copying guessed feature sets.

Viewer: run dependency-free Node tests and full unittest using the plain interpreter; run modern GDAL/Terrio comparisons using lwi-gdal with PYTHONPATH pointing at final semantic worktree python/python plus local test dependencies. tests/terrio-real-publication.py all --compare-only validates all 72 saved profiles; tests/terrio-real-cog.py validates real supplied overviews. tests/terrio-publication.py covers synthetic archives and atomicity. Do not confuse saved-archive verification with a rebuild.

Browser: README files under tests/viewer_acceptance and tests/viewer_retention_diagnostics document exact environment variables. Set VIEWER_ROOT to the local viewer, PLAYWRIGHT_MODULE to primary Terrio target/validation-tools/node_modules/playwright, ACCEPTANCE_SITE to .terrio-validation/pilot-site-final and ACCEPTANCE_OUT to a fresh ignored directory. Final quiet run: TRIALS=3,CYCLES=4. All-engine historical longer run: TRIALS=3,CYCLES=20. Separate final stress: ENGINES=webkit,TRIALS=1,CYCLES=80,POST_CLOSE_MS=1000. Audit raw.json after process completion; add --webkit-stress only for the named stress profile. Set TERRIO_SITE for decoder differential/lifecycle jobs and DIAGNOSTIC_SITE for controls. Old default pilot-site intentionally remains archived; explicitly select final package.

Next adoption decision: define actual device/session/RAM budget and perform matching acceptance there, especially Safari/WebKit; retain exact numeric/RGBA/error gates. Coordinate the generic finish_cog vendor hook in a new local clb_lwi_webmap worktree before production use. Broaden independent corpus/CRS/kernel coverage before claiming universal GDAL parity. No further implementation is justified merely to mask engine working sets; no automatic default switch, speculative remote ranges or algorithm rewrite is pending. Upstream packaging/publication remains outside current authorization. No deployment is required for this scope.

Tracked viewer source is clean. Reconciled Terrio retains only generated untracked target-clb-semantic/ and Python PDB; primary coordinator has an untracked local session-state file. Preserve them. No credentials or generated binaries/private data were committed.
