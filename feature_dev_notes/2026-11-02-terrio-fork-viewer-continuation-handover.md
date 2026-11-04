# CLB Terrio / viewer continuation handover — 2026-11-02

## Final scope and delivery

This supplements `2026-11-02-terrio-wasm-contributions-handover.md` without
overwriting it. The user's final instruction is **fork-only work**: leave the
already-created upstream PRs alone, finish CLB experiments, preserve defaults,
and do not merge main, publish a release, or deploy production.

All code/builds were workstation-local. This continuation note is the only NAS
write during the continuation. NAS viewer code and data were read/copied only.
No upstream actions occurred after the fork-only correction. Before that
correction, PRs https://github.com/opengeos/terrio/pull/503 and
https://github.com/opengeos/terrio/pull/504 had been created and linked. They were
open at the correction; they were subsequently left unchanged, including their
backing branches. Do not close, comment on, update or review-fix them without a
new user instruction. No further upstream PR was submitted.

### Verified CLB branches

| Repository / branch | Remote head SHA | Local worktree |
|---|---|---|
| `CLB-Engineering-Corporation/ras2fim-viewer-wasm`, `feat/terrio-experimental-backends` | `e056a294972c78a8bd4dc2aac2c45a072a2a9493` | `D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102` |
| `CLB-Engineering-Corporation/terrio`, `feat/fork-scientific-contributions` | `7f09be44ff95937cf66801da730d2b17e7d9d440` | `D:/CLB-Dev/wt/terrio-scientific-fork-20261102` |
| `CLB-Engineering-Corporation/terrio`, `feat/wasm-viewer-contributions` | `165450036879d4080aa20b8186dfe42217e2b79d` | `C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions` |
| `CLB-Engineering-Corporation/terrio`, `perf/owned-multidim-c` | `c6e892781e1f0a14954b18d5eb860b1cfc167fee` | `C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-b4f8df7e` |
| `CLB-Engineering-Corporation/terrio`, `feat/tile-overview-resampling-trial` | `45f6035255dacecfbe53d5e2b05b6381ae88a23b` | `C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-4547a03d` |

These are feature branches, not main merges. No new fork PR was necessary for
delivery. The viewer repository was cloned locally at
`D:/CLB-Dev/ras2fim-viewer-terrio-20261102`; its own worktree above began at
`56ab35f`. No child checkout was created by shell: T3 created delegate worktrees;
the coordinator created only its own viewer/scientific integration worktrees.

Viewer commits:

- `17dd8ff274d08a04479403f33e83b61354cf8d62`: exact reused-COG extrema.
- `b3da3fbeec952764eb01323b8e7c98c011af0e47`: experimental decoder, slices,
  ownership, packaging, lifecycle and display-bin fix.
- `2712cd523a76d5b4a90316093073ab6b7b7b1081`: guarded PMTiles/COG trials and tests.
- `e056a294972c78a8bd4dc2aac2c45a072a2a9493`: escaping-link regression and explicit
  Float32 codec-readback tolerance.

The scientific branch is based on inspected upstream snapshot
`a2a359a4ecf082096d59b990054aa59adbbe71dc`, with independently adapted A/B/C
changes; it is **not** a reconciled replacement for all CLB main features.
Its commits are `d937946`, `c511f38`, `482ca50`, `5ef6cbb`, `7f09be4`.
The original CLB-based branch retains the earlier A/B/C work and adds the tile
option at `1654500`; it remains based on CLB `3ad8f58`.

## Implemented viewer behavior

- `terrio-adapter.js` maps the existing multidimensional API into the existing
  reader's metadata, packing, units, dimensions, flow, fill and geodesy validation.
  No flood-specific Terrio APIs or new interpretation rules were introduced.
- Explicit `?decoder=terrio` is full-stack; `?decoder=terrio-slices` reads one
  flow layer plus retained terrain. **h5wasm remains default.** No malformed-input
  retry through another decoder. Whole-file fetching remains explicit.
- Workers keep protocol1, metadata-before-layer, top-flow-first scheduling,
  MessageChannel task yields, sparse output transfer, epoch handling and fetch
  aborts. Dense inputs/handles never transfer to the main thread. Completion,
  cancellation, supersession and error paths release source/view handles.
- A test-only HTTP instrumentation layer exercised the real WASM handles. An
  injected slice failure reports `prepare`, with zero retained tracked handles.
  Cancellation followed by a new epoch also ends at zero. Separate injected init,
  fetch and malformed-file decode errors report the appropriate phases.
- Site assembly accepts `--terrio-package`, copies an explicit web asset set,
  declarations, notices and snippets, and records SHA256 provenance. Validation
  requires every packaged asset, rejects incomplete/malformed inventories, checks
  hashes and resolved containment, and rejects escaping file/directory links.
  Existing nonempty package destinations are refused to exclude stale assets.
- The vendor-fetch script's stale `../frontend` path was corrected to
  `../viewer-1d`. Generated packages/libraries/data are ignored, not committed.
- Reused COG extrema now call the exact base-resolution path. A real GDAL test
  with an overview maximum below the base maximum guards the regression.

### Dense/sparse RGB mismatch resolution

Real pilot testing initially reproduced pre-existing dense-versus-sparse
verification mismatches on the h5wasm baseline (for example 52 channels differing
by1 at one depth layer). The old dense oracle used raw-domain ramp arithmetic;
the actual sparse renderer stores Float32 physical depths. Bin boundaries could
therefore disagree despite identical samples and painted populations.

The display contract is now explicit: independently derive physical depth from
native samples, round once to the public Float32 display representation, then
normalize/clamp/floor into the 256-bin ramp. The sparse renderer's pixels and the
signed statistics were preserved. A fixed independent expected-bin regression
and exact full-RGBA comparisons enforce the contract. Dense verification scratch
is cleared before reuse, preventing stale transparent RGB from prior layers.
No nonzero RGBA tolerance or hidden-alpha exception was introduced.

## Actual decoder, lifecycle and packaging validation

Final viewer checks:

- `node --test tests/*.test.mjs`: **55 passed**.
- `python -m unittest discover -s tests -t .`: **98 passed** on the workstation.
- `python -m pipeline.check_conventions`: **135 checks, 0 failures, 0 warnings**.
- New Python files pass Ruff; changed legacy modules introduce no new Ruff
  findings relative to their base. Existing unrelated legacy findings remain.
- `git diff --check` passed; final viewer working tree clean.
- Ten synthetic real-decoder cases pass: depth, WSEL, Float32, missing fill,
  unequal packing, receding/all-dry layers, noninteger flows, and rejected missing
  variables, malformed shape, rotated grids and truncated input. Native values,
  types, metadata, signed statistics, sparse products and full RGBA are exact.
- All three actual pilot NetCDFs pass the same comparisons. Each decoder mode
  ran five worker loads per file: **45 jobs / 765 layers**, exact verification.
- The five injected lifecycle/error scenarios pass against the final artifact.
- Final packaged pilot site: **75 deep checks, 0 failures/warnings**. Earlier
  runs had91 checks before hash checking was consolidated into the strict helper;
  this is not an omitted asset check. Final packaged worker hash equals source.
- Foreground T3 preview had `document.hidden === false`, rendered the real large
  `wb-2427466` flood, and exercised stream switching and slider changes under
  `?verify=1`. Synthetic dry/receding frames were also exercised. Final pinned
  artifact loaded and reported no verification mismatch. Preview tabs were
  closed after acceptance; no production hosting was changed.

Scientific branch checks:

- Eight selective package regressions pass, including qualified thread feature
  rejection; packaging tests are wired into its CI job.
- Final optimized single-threaded web/WASM package built; real npm file inventory
  includes declarations/notices and excludes absent variants.
- Browser numeric/ownership/growth/worker suite passes against that exact artifact.
- Five fresh contexts plus100 warm decode samples recorded. Initialization median
  69.7ms / p95 73.7ms; warm decode median0.3ms / p95 0.5ms for the tiny synthetic
  fixture. These are local browser observations, not viewer performance promises.
- Node22 web-module conformance also passes with forced memory growth. Earlier
  A-only optimized Node-target package built; a separate Node-target artifact was
  not rebuilt after final C integration (the final web WASM itself ran in Node).
- Final scientific changed-file pre-commit passes, including workspace Clippy
  with `-D warnings` and Cargo formatting. An initial unbounded pre-commit build
  was stopped and rerun with the required two-job/debug0 settings.
- C's focused tests, allowlist regression, workspace Clippy, WASM binding check
  and Rust1.90 core check passed. Minimal-feature unit-test gating failures are
  pre-existing; default-feature focused tests passed.
- Original CLB Python extension rebuilt locally; Python multidimensional runtime
  suite: **4 passed**. Tile-enhanced bindings pass WASM check with
  `--no-default-features --features netcdf-hdf5,tiles`.

## Input/artifact pins and measurements

Final scientific WASM source: `7f09be44ff95937cf66801da730d2b17e7d9d440`.
Raw14,238,241 bytes; gzip level9:5,229,673 bytes.
WASM SHA256: `DD196F4B6B38347C92E2548054F4146E7BCCF206559A4787F76F227A27DFA7E6`.
Native CLB Python source: `165450036879d4080aa20b8186dfe42217e2b79d`, dev/debug0.
Local `_terrio.pyd` SHA256:
`C600F30CF5E69E64C60548A397F6B48E7EF66E2639C8205247DC9F30CFB1DC5D`.
Native package version0.5.0; final scientific package version0.6.1. Do not infer
source identity from those version strings alone.

Pilot source SHA256:

| File | SHA256 |
|---|---|
| `filter_depth_wb-2427467.nc` | `CFCACF5B32FC8F8AE7B1EDBF63F7133DE58E890350BFB2359123A797B789DAE6` |
| `filter_wsel_wb-2427466.nc` | `0704ADAE7086E00AAD4B32B296D99A7562E48A61C9B3532055E5FD6B75C6E28F` |
| `filter_wsel_wb-2427467.nc` | `D43106C65D2147763910E55D4589FC2A147302FFE402B94AE19C9CAB3AD97183` |

Environment: Windows, Rust1.99.1, Node22.17.1, wasm-pack0.15.0,
Playwright Chromium156.0.8078.4. Modern `lwi-gdal` interpreter is Python3.12.14,
GDAL3.13.0 (3130300), NumPy2.5.2; do not invoke the old system GDAL executable.
Local Go PMTiles CLI1.31.2 and Python pmtiles3.8.1 were used for archive checks.
Tools/dependencies were kept under local ignored validation directories where
possible. Heavy builds used disk targets, debug0 and Cargo jobs2; final Binaryen
optimization used BINARYEN_CORES2. No NAS compilation occurred.

### Copy-removal allocation evidence

C's reproducible `owned_bytes_peak` example compared the actual old binding-like
expression `open_bytes(&bytes.to_vec())` with `open_bytes_owned(bytes.to_vec())`.
Eighteen fresh-process runs (three per format/mode) verified all decoded values.

| Input | Old additional peak requested Rust heap | Owned path | Retained delta |
|---|---:|---:|---:|
| CDF-1,67,108,944 bytes | 201,326,848 | 134,217,904 | 67,111,099 both |
| netCDF-4,201,331,605 bytes | 603,994,834 | 402,663,229 | 201,356,999 both |
| HDF5 +512-byte userblock | 603,995,346 | 402,664,253 | old201,356,999 / owned201,357,551 |

Savings are about one input buffer / one-third of opening's additional requested
heap. The dependency still copies Vec into Arc<[u8]>. This native forwarding
allocator surrogate excludes JS memory, allocator fragmentation/native bypasses,
RSS and browser peaks. The owned userblock path retains its prefix/wrapper.
Full methodology/raw results are committed in
`crates/terrio/examples/owned_bytes_benchmark.md` on the scientific/C branches.

### Viewer repeated-load counters

For the large1963x1331 /15-layer pilot, all three backends produced exact results.
Simultaneously referenced decoded JS typed arrays: full83,608,096 bytes;
slice+terrain10,451,012 bytes. These counters exclude input, sparse accumulation,
scratch, WASM and allocator overhead.

Recorded WASM capacity per five loads:

- h5wasm:117,440,512 then160,038,912 for loads2–5.
- Terrio full:239,403,008 for all five.
- Terrio slices:98,238,464 for all five.

Capacity/high-water observations are not live heap, total peak RSS or proof of
leak freedom. Four warm-load medians from the final run for decode+prepare were
approximately324ms h5wasm,616ms full Terrio,600ms sliced Terrio. Slices produced
the first prepared layer earlier in that run (about134–141ms warm versus187ms
for h5wasm); this is **not measured first visible paint**. All-layer preparation
is slower; no default switch is justified. Raw timings and all samples remain
in `.terrio-validation/pilot-benchmark-final.log`.

## 1D PMTiles compatibility outcome

The trial preserves the existing COG-to-RGBA step, library-wide ramp, strictly
positive paint mask, profile keys and atomic output replacement. Its explicit
base BILINEAR / overview AVERAGE controls now forward consistently through the
generic fork tile API. Defaults in Terrio and viewer remain unchanged.

Synthetic one-pixel, edge, off-grid and partial-alpha cases match GDAL exactly
in decoded pixels/alpha, coverage, bounds and zooms. GDAL's reopened MBTiles
overview availability stops at the first level under256 pixels in both axes;
the trial matches that small-raster rule. Primary reference:
https://github.com/OSGeo/gdal/blob/v3.13.0/frmts/mbtiles/mbtilesdataset.cpp
and https://gdal.org/en/stable/drivers/raster/mbtiles.html .

The complete local72-profile real pilot was rebuilt and every populated tile
compared. Exact library maximum: **31.83563232421875ft**.

-72/72 coverage matches;72/72 header bounds/zooms match;0 alpha mismatch profiles.
-**72/72 profiles have RGB mismatches**, including536,011 differing visible
  channels across saved archives; largest channel delta30. No tolerance was
  substituted for equality. This is a real promotion blocker, not container-byte
  noise or transparent-only RGB. Further investigation may concern reprojection
  and RGB filtering; it was not concealed with a ramp or algorithm rewrite.
-One corpus build took149.04s GDAL and226.81s Terrio. This is one ordered corpus
  run, not cold/warm throughput medians or a production benchmark.
-All-dry profiles explicitly refuse empty-archive publication and preserve the
  prior artifact; baseline empty-archive conversion was already unsupported.
  Empty-output support remains a gate before universal adoption.

The 1D baseline copied to local scratch passed **958 deep checks**,0 failures,
with its existing warning for reach5789842's nonmonotonic stage preserved.
Because RGB acceptance fails, no Terrio 1D release/default switch or MapLibre
acceptance claim for Terrio archives is made.

## Bounded COG writer outcome

`finish_cog(..., writer_backend='terrio')` remains the only trial entry point.
It retains the existing GDAL-built area-matched/mode arrays, provenance stamping,
bounds checks, independent layout validator and atomic replacement. Terrio writes
the supplied arrays; its own area-matched algorithm is never substituted.

Synthetic DEFLATE: base/overviews exact; CRS/transform/nodata/metadata match.
Synthetic LERC_DEFLATE: each writer's base/overview error relative to supplied
arrays was0.00959003 /0.00999498 or less, under0.01; their decoded pixels are not
all identical. Both independent layout checks pass. Injected writer failure
preserves a previous destination and removes the partial.

A real WGS84 `depth_071` profile also passed both writers, including CRS,
geotransform, nodata masks, metadata, level dimensions and identical area reports.
Observed per-level error was0,0.010000228881835938,0.010000228881835938,
0.009994029998779297. The test explicitly allows nominal0.01 plus one Float32
readback ULP (0.010001907348632813 for this fixture), not pixel identity.

This optional hook is an explicit experimental extension to a vendored module.
Coordinate the same generic hook with `clb_lwi_webmap` before production adoption;
no edits were made to that other repository. Preserve its existing envelope and
FIM-prefix differences. GDAL remains the default writer.

## Preserved broad reconciliation blocker

An isolated ordinary no-commit merge was attempted before the final instruction
to leave upstream integration alone. It is preserved, **not committed or pushed**:

- Worktree `C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-9ebd6658`.
- Branch `feat/clb-upstream-reconciliation-20261102`, HEAD83faa7b,
  MERGE_HEADa2a359a,28 conflicted paths.
- Inventory/evidence: `CLB_RECONCILIATION_20261102.md` in that worktree.
  Original fork divergence was30 commits /14 non-merge; with A/B/C,33 /17.
- Streaming multi-source warp overlaps upstream source-mask/global-validity
  semantics; selecting either side loses behavior. COG supplied/area/factor and
  LERC-edge policies overlap upstream overview resampling. These require explicit
  scientific reconciliation and regressions, not textual ours/theirs selection.
- Offline metadata passed; fmt/build blocked by conflicts. Do not use this
  unresolved checkout as the viewer dependency. No main merge is authorized.

## Reproduction / local evidence / remaining gates

Viewer evidence lives under ignored
`D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102/.terrio-validation`:
`differential-final.log`, `worker-lifecycle-final.log`, `pilot-benchmark-final.log`,
`node-tests.log`, `python-multidim.log`, `publication.log`,
`publication-before-overview-option.log`, `publication-before-zoom-fix.log`,
`real-publication-all.log`, `real-publication-visible.log`, `real-1d-deep.log`,
`real-cog.log`, `final-package-size.json`, real/synthetic fixtures, saved baseline
and candidate archives, generated sites and dependency directories. The corpus
report SHA256 is6055CD755EF563815BE2B59A8D8A2C1C8E1845BE2F8EEB1A95A5D09A99DCDA66.

Scientific evidence: `D:/CLB-Dev/wt/terrio-scientific-fork-20261102/target/evidence`;
the Cargo native validation target is under its `target/native-validation`.
The optimized WASM build reused the completed A-worker disk target sequentially:
`C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-d811b256/target-upstream-a`.
CLB Python/WASM-check target:
`C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-1ef3efe2/target-owned-input`.

From the viewer worktree:

```powershell
node --test tests/*.test.mjs
python -m unittest discover -s tests -t .
python -m pipeline.check_conventions
python tests/terrio-fixtures.py
$env:PLAYWRIGHT_MODULE = 'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright'
node tests/terrio-differential.mjs
node tests/terrio-worker-lifecycle.mjs
$env:TERRIO_FIXTURES = '.terrio-validation/pilot'
$env:TERRIO_WORKER_REPEATS = '5'
node tests/terrio-differential.mjs
python -m pipeline.fim2d.site .terrio-validation/pilot --out .terrio-validation/pilot-site --terrio-package D:/CLB-Dev/wt/terrio-scientific-fork-20261102/js/pkg-scientific
python -m pipeline.fim2d.validate .terrio-validation/pilot-site --deep
```

For GDAL trials, use the lwi-gdal Python above and set PYTHONPATH to the local
`.terrio-validation/py311` directory (historical folder name; contains Python3.12
dependencies) followed by `.terrio-validation/python` (local CLB extension).
Run `tests/terrio-publication.py`, `tests/terrio-real-publication.py all`, and
`tests/terrio-real-cog.py`. The local CLI is `.terrio-validation/bin/pmtiles.exe`.
No downloaded binaries, wheels, datasets or generated artifacts are committed.

Remaining gates are explicit: real PMTiles RGB/empty-output acceptance; stronger
browser RSS/long-duration retention and first-visible/interaction benchmarks;
other browser engines/platforms; full workspace test/MSRV matrices beyond focused
checks; vendor-hook coordination; and scientific resolution of the preserved
fork catch-up conflicts. Remote multidimensional ranges, COG algorithm changes,
State Plane warp replacement, main merges, releases and production deployment
remain outside this delivered experimental scope.
