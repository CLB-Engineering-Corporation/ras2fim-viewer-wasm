# Terrio upgrade plan — upstream-based CLB fork, then a new viewer runtime

Recorded 2026-11-15. Status: **approved, in progress**. Progress is tracked in
the [status table](#status) at the bottom; each phase's evidence lives in the
scratch workspace named under [Working locations](#working-locations) until it
is promoted into a commit.

This supersedes nothing in [terrio-implementation-plan.md](terrio-implementation-plan.md).
That plan adopted Terrio; this one moves the adopted runtime forward.

## Decision

Use **CLB's fork, rebuilt on a frozen upstream-main commit**, and pin the result
here as a new reviewed runtime. Order: reconcile the fork first, upgrade this
repository second.

Upstream supplies the foundation and ongoing fixes. The fork keeps only CLB
capabilities upstream does not provide equivalently. Switching straight to
upstream would risk changing the scientific overview, tile resampling and
NetCDF ownership behaviour this viewer depends on.

## Frozen identities (2026-11-15)

| Source | Identity | Note |
|---|---|---|
| Viewer runtime pin | `9c644f4`, package `0.6.1+clb9c644f4.1` | Browser WASM and native Python |
| CLB fork `main` | `ebf2f2015143fe5a562521ef49e0a4236a393ed5` | 99 commits beyond the viewer pin; still self-labelled 0.6.1 |
| Upstream `main` | `a7473c210e258f8b24cb4efe7c76fc73244601c2` | Nine commits beyond release 0.9.0 |
| Fork vs upstream | 138 ahead, 328 behind | Ancestry counts; some changes are equivalent under different commits |

Upstream 0.9.0 brings threaded raster reads, decoder reuse, remote COG reads and
lower-memory COG copying. The fork brings removal of a redundant full-file
NetCDF copy and decoded GeoTIFF chunk caching.

The frozen upstream commit does not move during this work. A later upstream
commit is a separate, later upgrade.

**Re-frozen 2026-11-20** (maintainer approval) at upstream `main`
`80c9e7ad3a0ce95e351f6e3988e62b680ba07da3`, still 0.9.0, 122 commits past
`a7473c2`. Moving it before qualification started cost one small merge into
the reconciliation branch; moving it later would have repeated phase 4. This
is now the freeze.

## What is and is not expected

- **Expected:** lower NetCDF opening memory in the browser; inherited upstream
  fixes; a smaller, better-justified fork.
- **Unproven:** faster slider painting. This viewer already prepares sparse
  layers ahead of time, so the paint path may see little change. It is measured
  in phase 8, not assumed.

## Working locations

- **Terrio reconciliation:** a workstation-local native-Git clone at
  `D:\CLB-Dev\scratch\terrio-upgrade-2026-11\terrio`. The shared checkout at
  `H:\CLB-Repos\terrio-clb` is not used: it is a live shared tree with another
  contributor's uncommitted change and linked worktrees, and the runner does not
  permit `worktree`.
- **Evidence** (baselines, ledger, test logs):
  `D:\CLB-Dev\scratch\terrio-upgrade-2026-11\evidence\`.
- **Viewer changes:** this repository, on a feature branch, through `clbgit`.

## Rules that hold throughout

- No force pushes to the fork (Terrio `AGENTS.md`). The candidate is a **new
  branch** built from upstream with CLB feature groups replayed onto it.
- Never re-upload a wheel or runtime under an existing name. New source means a
  new package version, filename and digest.
- Python files in the native wheel stay CRLF on every platform.
- Native builds stay Cargo dev-profile for the like-for-like candidate. A
  release-profile build is a **separate** candidate with its own identity and
  parity evidence, so the compiler's effect is not confused with the source
  upgrade's.
- `tests/safari_acceptance/thresholds.json` is not edited after results are
  seen.
- The viewer does not gain product scope in this change. Optional new Terrio
  features are adopted in follow-ups.
- One integration owner; subagents take bounded implementation and review
  scopes.
- **CI during this work is Linux and Windows only, on Slurm where a job needs
  it.** macOS (the two macOS native wheels, the macOS legs of the `native` job
  and Safari acceptance) runs once, before release, not per iteration
  (maintainer direction, 2026-11-15). Phases 5, 7 and 8 are therefore each split
  into an iteration gate (Linux + Windows) and a release gate (adds macOS).

## Phases

### 1. Freeze sources and establish baselines

Record exact upstream, fork and viewer SHAs, toolchains, build features, GDAL
reference version, artifact digests and fixture hashes. Preserve the existing
runtime and release assets for rollback.

Run the viewer's fast checks and representative decoder and publication tests
before changing anything. Capture first-render, preparation, stream-switch,
memory and native publication measurements on the machine that will run the
candidate comparison.

**Exit:** a reproducible baseline, with existing failures recorded as such.

### 2. Inventory the fork's changes

Classify each independent fork feature as: already upstream, still required,
superseded, unrelated to the viewer but needed by other fork consumers, or
unresolved. Compare patch identity and tests, not only commit history. Start
from the fork's `docs/CONSOLIDATION-2026-11.md`.

Particular attention:

- Scientific overview policy, nodata handling, supplied overview arrays,
  independent tile overview resampling.
- Owned NetCDF input, HDF5 userblocks, typed arrays, dataset and view lifetimes.
- Selective WASM builds and licence inventories.
- Zstandard implementations, native TLS CPU compatibility, feature propagation.
- HEC-RAS/Arrow, GeoParquet and FileGDB integrations.

**Exit:** a disposition ledger mapping every retained behaviour to its
implementation and its regression evidence.

### 3. Build the upstream-based reconciliation branch

Start from upstream `a7473c2`. Replay coherent CLB feature groups, dropping
duplicates and superseded implementations. Resolve in bounded batches:

1. Cargo dependencies, features, codecs, TLS.
2. Raster storage, caching, threading, HTTP.
3. COG, warp, overview and tile semantics.
4. Multidimensional decoding, bindings, WASM.
5. Remaining fork integrations, documentation, notices.

**Exit:** an auditable candidate: current upstream plus justified CLB
differences.

### 4. Qualify Terrio before touching the viewer

Focused tests after each batch; then formatting, Clippy, locked Rust tests,
relevant Python tests, JS scientific conformance, selective WASM builds, the
feature matrix and licence validation.

Compare against both references — upstream for inherited fixes, old CLB for
retained behaviour. A changed output is investigated, not accepted from either
side by default.

**Exit:** a reviewed candidate with no unexplained correctness regression and
its intentional differences written down.

### 5. Build new immutable artifacts

The minimal single-threaded `netcdf-hdf5` web package, and native wheels for
Windows AMD64, Linux x86_64/arm64 and macOS x86_64/arm64. New versions,
filenames, digests and provenance.

**Exit:** independently verifiable WASM and five-platform native artifacts.

### 6. Upgrade the viewer's integration together

Refresh the three Terrio locks, the Python pin, acquisition scripts, the runtime
and native workflows, hard-coded source assertions, Safari candidate pins and
artifact documentation. The old pin appears in 19 files; all move in one change.

Change the adapter only where a verified API change requires it. Preserve
profile ordering, packing, feet/unit conversion, sparse rendering, worker-local
dense data, cancellation and the explicit reference backends.

**Exit:** the default site builds and fresh artifact acquisition works from the
new pins.

### 7. Viewer correctness and publication acceptance

- Node and Python tests, conventions checks.
- Generated fixtures and real pilot data through h5wasm, Terrio full-stack and
  Terrio slices.
- Exact packed values, masks, metadata ordering, sparse output and RGBA;
  the existing declared bounds for lossy COG output.
- Backwater metadata, malformed-input recovery, cancellation, stale-generation
  rejection, handle disposal.
- Five-platform synthetic publication checks and all 72 real pilot profile
  archives.
- Deep 1D and 2D validation; visibly rendered wet → dry → wet transitions in a
  foreground browser.

**Exit:** unchanged hydraulic and display meaning, with complete publication
evidence.

### 8. Measure performance; fix the Safari method before running it

Old versus new runtime under matched conditions: module size and init, first
prepared layer, first completed map render, total preparation, stream switching,
slider median and p95, decoded-array bytes, WASM capacity, process-memory
samples, native publication throughput.

The repository already records that historical Safari memory attribution is not
comparable and that VM timing does not transfer to a workstation. A replacement
method — fresh Safari processes and/or same-VM controls — is declared **before**
the run. Old results and thresholds are preserved.

**Exit:** independently audited results, with gains, regressions and limits
stated plainly.

### 9. Integrate in dependency order; keep rollback

Finish the Terrio reconciliation review, freeze its accepted source, then finish
the viewer review against that identity. Reconcile stale documentation.

## Maintainer decisions, 2026-11-21

- **Warp sampling:** upstream's grid-invariant default stays in the tile writer. The real pilot is identical; the
  synthetic tile digests and the reported figures in `docs/terrio-assets.md` are re-baselined.
- **COG overview policy:** the fork switches its default to upstream's (GDAL-style overviews). `SOURCE` remains
  available by option. Upstream's policy sizes overviews by floored halving and refuses the viewer's ceil-sized
  supplied arrays (894x1820 for 1788x3639) on all 72 real-pilot COGs, so **the viewer passes
  `COG_OVERVIEW_POLICY=SOURCE` explicitly**, as must any consumer that supplies overview arrays or uses
  area-matched overviews.
- **Zstandard notice:** the fork's `chore/zstd-bsd-notice` is applied (`fc1b6406`).
- **Pages redeploy:** after the viewer PR merges, both GitHub Pages sites (2D viewer, 1D dashboard) are rebuilt
  from `main` on the new pins, deep-validated, and redeployed. The 1D dashboard's content is unchanged.
- **Version:** `0.9.0+clb<sha>.1`, `<sha>` the accepted reconciliation tip.
- **Fork and CI:** the reconciliation branch is not pushed. Linux CI runs locally (Slurm); macOS CI is not run on
  the fork.
- **Native wheels:** Windows AMD64 and Linux x86_64 only. The native lock, its tests and docs change from five
  platforms to two; Linux arm64 and macOS are not built for this runtime.
- **Source of record:** the accepted Terrio tip is pushed to CLB's fork as a new branch before release, with a PR
  to fork `main` (fast-forward, no force push), so the lock's `source_commit` resolves on GitHub.
- **Build profile:** dev profile for this upgrade; an optimized build is a later, separate candidate.
- **Safari acceptance:** skipped for this upgrade and recorded as not measured. `thresholds.json` is untouched.
- **Landing:** viewer feature branch and PR, with the WASM runtime and the two wheels as a draft GitHub release
  under new names for the maintainer to publish.

## Points that need the maintainer, not an agent

These are outward-facing or irreversible and are not done without a go-ahead:

- Pushing the reconciliation branch to `CLB-Engineering-Corporation/terrio`.
- Moving the fork's `main` to the reconciled history.
- Publishing release assets (WASM runtime, wheels) under new names.
- Running the Safari acceptance workflow on GitHub macOS runners.

## Main uncertainty

How much fork behaviour upstream now duplicates. The phase 2 ledger answers it,
and that answer sets both the real size of phase 3 and how small the fork can
become afterwards.

## Status

| Phase | State | Evidence |
|---|---|---|
| 1. Baselines | done 2026-11-15 | `evidence\phase1\`. All checks pass on the old pin, no pre-existing failures. 1D deep validation is 1102 checks (not 454) with the one expected warning. Not measured: browser-rendered timing, the 72-archive real-pilot gate (inputs absent locally). |
| 2. Fork inventory | done 2026-11-15 | `evidence\phase2\ledger.md`. 59 conflicting files against `a7473c2`; seven behaviour differences flagged for decision. |
| 3. Reconciliation branch | done 2026-11-15 (local only) | `evidence\phase3\resolution.md`. Branch `reconcile/upstream-a7473c2`, tip `45be4c08`: merge `4ac8d3d4` of `a7473c2` into fork `main`, licence regeneration, `validate_cog` tiling fix (O12). Not pushed. Rust suites pass apart from two load-dependent upstream tests that pass alone; Python 344 pass, 17 environmental failures. Open decisions in its section 5. |
| 3b. Re-freeze merge | done 2026-11-21 (local only) | `evidence\phase3\resolution-80c9e7a.md`. Branch `reconcile/upstream-80c9e7a`, tip `d0df8adb`: merge `fff7bb70` of `80c9e7ad`, then licence regeneration. O1–O12 all hold; Arrow 59 kept (fast-hdf 0.5.0 pins `=59.0.0`). Windows: fmt, check, clippy, wasm32 check clean; `cargo test --workspace` 4457 passed, 0 failed; viewer-critical pytest 271 passed, 0 failed. |
| 4. Terrio qualification | in progress | Linux x86_64 on Slurm (`evidence\phase4\linux\summary.md`, job 72583): Rust 4605 pass, pytest 10043 pass, licence byte-identical, audit clean. Two real failures fixed in local commit `2564e1be` (a test assuming upstream's overview policy; a stale `--test` name in `ci.yml`); two Slurm-only memory-limit failures. Real pilot (`evidence\phase4\artifacts-trial\`): 72 of 72 depth PMTiles byte-identical to the old Terrio, 0 of 916 tiles differ from GDAL with default warp settings; new WASM reads all 9 NetCDF files identically. Trial Windows dev wheel (`summary.md` there): COGs within the LERC bound and now decode equal to GDAL's; viewer tests pass apart from 5 that assert the old pin; no measurable speed change, ~17 MB more peak memory. |
| 4. (earlier attempt) | superseded | `evidence\phase4\trial\`. The first full Windows `cargo test` was cut off with `link.exe` failures and no linker message, when the session hit its usage limit. Needs a clean rerun. 2026-11-20 check: viewer `main` and fork `main` unchanged; upstream `main` moved 122 commits to `80c9e7ad` (still 0.9.0, no new release). A trial merge into `45be4c08` conflicts in 10 files, about one hunk each. |
| 5. Artifacts | not started | |
| 6. Viewer integration | not started | |
| 7. Viewer acceptance | not started | |
| 8. Performance and Safari | not started | |
| 9. Integration | not started | |
