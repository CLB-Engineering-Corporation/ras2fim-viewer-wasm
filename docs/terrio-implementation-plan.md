# Terrio integration and contribution plan

Assessment date: 2026-11-02. Status: implementation proposal; no runtime migration or upstream submission performed.

## Decision

Adopt Terrio incrementally as reusable geospatial I/O infrastructure. Develop changes in the CLB fork with the intention of contributing general capabilities to opengeos/terrio. Keep flood interpretation, publication policy, and UI behavior in this repository.

The two-way assessment changes the priority: establish upstream alignment and a real decoder conformance suite first, then run independent 1D publication and 2D decoder trials. Do not make the viewer depend on a large fork-only API or require a complete GDAL replacement before it benefits.

The current viewer already paints quickly. The expected benefits are reduced dependency complexity, controlled decode memory, stronger format conformance, and reusable infrastructure. Faster rendering is not an established benefit. Benchmark before switching defaults.

## Evidence and version boundary

- CLB fork inspected: [`3ad8f58fee877e59a61c5d14d1afec311c76b8f4`](https://github.com/CLB-Engineering-Corporation/terrio/tree/3ad8f58fee877e59a61c5d14d1afec311c76b8f4).
- Upstream inspected: [`d7b30378c450d2bf994284ca1ecd084237e21d89`](https://github.com/opengeos/terrio/tree/d7b30378c450d2bf994284ca1ecd084237e21d89). GitHub comparison reports the fork 30 commits ahead and 109 behind. These are assessment snapshots, not permanent branch properties.
- Fork `AGENTS.md`, `docs/architecture.md`, and `docs/contributing.md` require shared algorithms in Rust, thin bindings, pure-Rust defaults, preserved lazy access, cross-surface consistency, and conformance evidence.
- Fork `js/src/multidim.rs` already exposes native typed arrays and lazy views. `js/Cargo.toml` already provides `netcdf-hdf5` independently of the full build. A new slicing API or basic feature flag is unnecessary.
- Fork `python/tests/test_tiles.py` already tests lazy versus eager archive equivalence, including alpha and several resamplers. This establishes Terrio internal consistency, not equivalence to this viewer's GDAL output.
- Upstream has additional multidimensional work, including `check()` and `mosaicMultidim`, absent from the fork snapshot. Reconcile before proposing overlapping APIs.
- [JavaScript documentation](https://terrio.dev/javascript/) and [multidimensional documentation](https://terrio.dev/multidim/) describe bytes-based browser opens and raw packed values. Browser NetCDF HTTP ranges are a separate capability from selecting a slice in downloaded bytes.

This assessment inspected code and documentation. No Terrio build, pixel comparison, or performance benchmark was run. Historical README timings are reference measurements, not new results.

## Ownership boundary

| Concern | Terrio | Viewer |
|---|---|---|
| File formats | Decode, native types, dimensions, attributes, codecs, lazy views | Recognize ras2fim variables and reject unsupported model layouts |
| Depth | Preserve raw values and packing metadata | WSEL minus terrain, unit handling, fill rules, unequal scale/offset fallback |
| Display | General raster resampling, alpha, encoding, archive I/O | Shared ramp, library maximum, positive-depth mask, sparse painting |
| Scheduling | Documented handle ownership and transport behavior | Worker epochs, priorities, task yields, progress, supersession |
| Publication | COG and PMTiles mechanisms, generic validation | Profile join keys, manifests, FIM provenance, release completeness |

Do not add a ras2fim-specific convenience API, flow-number interpretation, flood wetness predicate, or MapLibre dependency to Terrio. Its newer HEC-RAS support does not change this boundary: consuming existing ras2fim outputs remains this project's purpose.

## Phase 0 — Align versions and establish the baseline

1. Inventory the fork's 30 unique commits against current upstream changes and open PRs. Classify each as already represented upstream, independently upstreamable, conflicting, or deliberately CLB-only. Do not blindly merge or replay the entire fork.
2. Select an integration base and record exact Rust, Python, JS/WASM, Cargo.lock, and build-feature versions. Follow CLB shared-workspace Git rules and use a dedicated branch for implementation. Preserve unrelated working files.
3. Capture reproducible baseline outputs from existing backends, with input checksums, options, environments, and timings. Keep generated rasters/archives out of main-branch Git history.
4. Fix `pipeline/fim1d/cogs.py`'s reused-COG `ComputeRasterMinMax(True)` separately. Use exact base-resolution extrema and a regression where the overview maximum is lower. Rebuild baseline manifests before evaluating ramp agreement.
5. Add a benchmark harness that measures cold module initialization, compressed download size, fetch bytes, first visible layer, all-layer preparation, peak memory, repeated stream switching, and slider painting. Record hardware/browser versions and warm versus cold runs.

Exit: a pinned candidate dependency and trustworthy baseline. No production backend change yet.

## Phase 1 — Decoder adapter and conformance

Viewer changes: a separate Terrio adapter adjacent to `src/viewer-2d/netcdf.js`, worker initialization, integration tests, and packaging. Keep `netcdf.js` DOM-free and its dependency-free Node oracle intact.

First preserve the existing `R2F2D.readStack()` result contract: native packed arrays, dimensions, flow ordering, georeferencing, and metadata. A full-stack adapter isolates decoder differences before changing memory strategy. Backend selection is an explicit experimental build/test option; do not silently retry another decoder on malformed input.

Generate synthetic NetCDF fixtures using the existing fixture machinery. Exercise both real decoders, rather than only downstream painting. Cover compressed/chunked arrays, non-square grids, fill present/absent, valid zero and negative depth, empty and receding layers, noninteger flow coordinates, depth-only and WSEL/terrain files, equal and unequal packing, attributes, missing variables, malformed dimensions, truncated data, and supported numeric types. Preserve rotated-grid rejection and geodesy contracts.

Compare native values/types, ordered dimensions, parsed metadata, signed physical depths, `valid` and `positive` counts, statistics, sparse offsets/depths/bounds, and final RGBA. Require exact integer and RGBA agreement. Declare any floating comparison tolerance per quantity and justify it; do not relax pixel equality to conceal a changed ramp calculation.

Keep protocol version 1 when its meaning is unchanged: metadata precedes layers, sparse buffers transfer, dense buffers stay worker-local, stale epochs are ignored, and top-flow-first preparation and priority handling survive. Add explicit fetch/init/decode/prepare error phases. Abort superseded viewer fetches with `AbortController`; this alone needs no Terrio API extension.

Exit: differential tests pass against h5wasm, generated site contains all assets, and a foreground browser passes `?verify=1`. Keep h5wasm as the default until performance and lifecycle gates pass.

## Phase 2 — Bounded slice decoding

This is a separate change: current `buildIndex` addresses a whole `[flow,y,x]` buffer, so passing one layer is not a drop-in replacement.

1. Introduce an internal per-layer preparation input with an explicit layer identity. Keep whole-stack and slice paths feeding the same depth/statistics/paint logic.
2. Keep terrain plus the requested WSEL/depth slice, build sparse output, release the slice, and yield through `MessageChannel`. Preserve prioritization between slices.
3. Free array/view/dataset handles in success, error, and supersession paths. Verify child-handle lifetime semantics against the reconciled Terrio version. Use worker termination for immediate cancellation of a synchronous decode if required; an AbortSignal cannot interrupt arbitrary synchronous WASM work.
4. Never transfer a buffer aliasing WASM linear memory. Establish whether returned typed arrays are owned copies; copy explicitly when necessary. Test retained arrays across subsequent reads, memory growth, and handle disposal.
5. Retain whole-file fetch initially. Measure compressed input copies, WASM heap, terrain, decoded slice, accumulated sparse arrays, and verification scratch separately. WASM heap high-water retention is not proof of a leak, but repeated stream switches must not show unbounded retained memory.

Exit: identical results, unchanged ready-layer slider behavior, lower measured peak decode memory on large stacks, and stable repeated-load lifecycle. Avoid promising earlier first paint if global metadata/statistics still require a complete scan.

## Phase 3 — Direct 1D PMTiles publication

Change `pipeline/fim1d/depth_pmtiles.py` behind an explicit backend option, preserving `build_profile`, `build_library`, profile identity, and manifest records.

Start with the existing full-resolution COG-to-RGBA step. Replace RGBA GeoTIFF → GDAL MBTiles → pmtiles CLI with Terrio's lazy raster-to-PMTiles writer. Keeping the temporary RGBA source initially isolates archive behavior. Eliminate that intermediate only after a generic block transform is demonstrated useful and compatible.

Explicitly specify zoom selection, minimum/maximum zoom, resampling, PNG format, bounds, and alpha semantics. The existing publisher uses GDAL's base conversion and AVERAGE RGBA overviews. Terrio currently exposes one tile resampling option for reprojection and overviews; characterize both stages before assuming that one option reproduces the baseline.

Crucially, averaging colored RGBA pixels is not equivalent to averaging depth and applying the ramp afterward. Do not substitute numeric COG overviews for the current tile pyramid without an explicit rendering-contract change.

Compare decoded PNG pixels and alpha across every populated pilot tile and representative empty/edge tiles; compare z/x/y coverage, zooms, alignment, bounds, transparent-tile omission, and archive metadata. PMTiles container bytes need not be identical. Test all-dry, one-pixel, off-grid, tile-boundary, and partial-alpha cases. Keep library-wide normalization and depth-zero transparency unchanged.

Write to a sibling temporary archive, validate, then replace the destination atomically. A failed build must preserve the previous artifact. Record backend version/options in build provenance without making runtime delivery depend on config.js.

Exit: archive conformance plus existing deep 1D validation and visible MapLibre acceptance. Only then switch the publication default. Retain the old backend for a bounded rollback period.

## Phase 4 — COG writer and optional warp migration

Keep `finish_cog()` as the only publication entry point. Initially retain GDAL warp, existing overview arrays, tolerance, codec, FIM metadata, independent layout validation, and atomic replacement. Trial Terrio as the writer beneath that contract.

The fork's area-matched algorithm differs from this project's implementation in pyramid weighting, neighbourhood coherence, and tie selection. The same algorithm name does not guarantee equal pixels. Supply existing overview arrays first; treat algorithm changes as a separate scientific/rendering decision coordinated with `clb_lwi_webmap`. Preserve only the two documented vendor divergences.

Test base pixels within declared codec tolerance, every overview's selected cells/values, area reports, CRS/transform/nodata, metadata, layout, and error-path atomicity. Use an independent validator and GDAL readback; writer self-validation alone is insufficient.

Replacing State Plane/feet reprojection is optional later work. It needs independent horizontal units, CRS/grid availability, output alignment, extent, resampling, nodata, and vertical-value preservation evidence. Do not remove the lwi-gdal environment before these obligations are met.

## Contributions to develop in the CLB fork

Each item becomes a small independently reviewable PR after checking current upstream and open issues. The names below describe scope, not promised public API names.

### A. Scientific WASM build recipe and package tests — first

Existing `netcdf-hdf5` feature flags are sufficient for an experiment. Add a documented reproducible minimal scientific build, generated declarations/assets, license notices, and browser-worker smoke tests. Extend `js/build.mjs` packaging only where necessary; propose an official preset only if maintainers want another supported distribution.

Tests must cover both supported numeric reads and clear errors for excluded formats. Measure raw and compressed size, initialization, and decode performance against full/core builds. Do not call core a NetCDF build. Prefer single-threaded WASM in a worker so existing static hosting does not acquire COOP/COEP requirements.

Design fit: thin packaging around existing Cargo features; no application-specific code.

### B. Multidimensional browser conformance and lifetime documentation — first

Contribute generic synthetic packed/chunked NetCDF fixtures, typed-array lifetime tests, metadata tests, malformed-input tests, and a minimal worker example. Put format fixes in `crates/terrio/src/multidim` or the underlying driver, with thin binding changes only when required. Cover relevant Rust/Python/JS surfaces.

Document copied versus borrowed array ownership and disposal. Do not add an unsafe zero-copy API merely to reduce one allocation. Add read-into or buffer-reuse APIs only after profiling proves copies material and an ownership contract fits existing patterns.

Design fit: format conformance and safe cross-language ownership benefit all scientific consumers. Exclude ras2fim variable names and flood calculations from generic tests/examples.

### C. Remove a redundant input-buffer copy — concrete early optimization

The inspected fork's `js/src/multidim.rs` calls `open_bytes(&bytes.to_vec())`; `crates/terrio/src/multidim/netcdf.rs` then constructs retained `BytesStorage` from another `body.to_vec()`. This creates an intermediate owned Rust buffer followed by another retained buffer. Re-check after upstream reconciliation, then add an owned-input core path while preserving the borrowed-input API, and pass the binding's converted buffer into owned storage. Handle HDF5 userblock offsets deliberately.

This is not zero-copy JS-to-WASM: that boundary still copies. Instrument peak allocations and verify classic NetCDF, NetCDF4, HDF5 userblocks, metadata, typed values, and view lifetimes. This is a stronger initial optimization candidate than inventing a new public buffer API without evidence.

The current `.read()` conversion creates JS-owned typed-array copies; retain that safe default. Selected views keep source storage alive, so releasing only a dataset wrapper does not necessarily release its bytes. Include both facts in contribution B's documentation/tests.

Design fit: generic ownership efficiency in the shared implementation, with a thin binding change and unchanged values.

### D. Tile resampling and alpha compatibility — conditional, high value

Extend generic RGBA/off-grid/pyramid tests against independent GDAL references. If the viewer comparison demonstrates that base reprojection and overview filtering need distinct controls, add an optional overview-resampling setting to shared tile options, preserving current defaults. Expose applicable options consistently in Rust, CLI/MCP, Python, and JS.

Test transparent RGB contribution, partial alpha, empty outputs, tile omission, bounds, zoom selection, and lazy/eager equivalence. Contribute minimal fixes where behavior violates the documented contract. Keep the CLB ramp and wetness rules outside Terrio.

Design fit: reusable tile-writer behavior; no flood-specific resampler. Do not reimplement streaming PMTiles, which already exists.

### E. Browser remote multidimensional access — later design proposal

The inspected JS API opens NetCDF/HDF5 from bytes; existing remote raster APIs do not establish remote multidimensional support. Reuse Terrio's storage/cache abstractions if extending this, rather than adding a viewer-owned HDF5 HTTP parser.

The existing `js/src/remote.rs` already bridges asynchronous fetch to synchronous sparse reads with retries, coalescing, caching, and request/byte counters. Extend that pattern only after confirming that multidimensional storage can use it safely. Define range-reader capability, cache limits, cancellation, and diagnostics within those established patterns. Test HTTP 206/Content-Range, servers ignoring Range, 416, CORS, source identity changes, retries, truncated responses, compressed HTTP bodies, and cache eviction. Make any whole-file fallback explicit and bounded.

Existing custom-fetch support can attach an AbortSignal. Add direct signal plumbing only if a consistent generic API is warranted; it should cancel pending requests/retries without promising interruption of synchronous decoding.

Measure actual requests, transferred bytes, and decompressed chunks for selected slices. Chunk layout limits savings. A small highly compressed pilot may be faster with whole-file fetch; this feature is not a prerequisite for initial adoption.

Design fit is conditional on maintainer acceptance of the transport design. Prototype and document tradeoffs before adding a public method.

### F. Existing COG capabilities and compatibility tests — later

Reconcile the fork's supplied-overview, area-report, metadata, validation, and streaming work with upstream. Offer missing generic conformance tests and small fixes before new algorithms. Preserve algorithm identity and documented semantics rather than changing an existing default to match CLB silently.

## Delivery sequence and review gates

1. Viewer baseline/extrema correctness; upstream/fork reconciliation inventory.
2. Terrio build recipe and generic browser conformance; viewer decoder adapter and packaged differential harness.
3. Viewer direct-PMTiles experiment in parallel with the decoder work, with separate file ownership.
4. Terrio tile fixes/options only as demonstrated by comparison; viewer bounded-slice preparation.
5. Default switches independently after acceptance. COG writer and remote access remain separate follow-on decisions.

For implementation parallelism, one worker can own Terrio multidimensional/package changes, one the viewer decoder adapter, and one the 1D publication adapter. The main integrator owns shared contracts, pins, release validation, and Git integration. Agree fixture schemas and backend interfaces first; do not let multiple workers edit shared release files independently.

Terrio PRs follow its contributor checks: formatting, Clippy, relevant tests, affected bindings/WASM builds, public API docs, pre-commit, and required broader/MSRV/conformance checks. Use synthetic/public data in contributions. Include exact versions, reproduction, numerical tolerances, measured I/O and limitations. Re-check upstream before submission; open regular PRs per its instructions. Merge/release is a separate action from preparing and submitting contributions.

Viewer checks:

```powershell
node --test tests/*.test.mjs
python -m unittest discover -s tests -t .
python -m pipeline.check_conventions
# In lwi-gdal, against a built 1D fixture/release:
python -m pipeline.fim1d.validate src/viewer-1d --deep
# Plain workstation interpreter, against a generated 2D release:
python -m pipeline.fim2d.site <dir-of-nc> --out <test-site>
python -m pipeline.fim2d.validate <test-site> --deep
```

Add the real decoder differential job separately; do not make the dependency-free Node oracle require WASM installation. Extend `VIEWER_FILES`, `VENDOR_FILES`, vendor-fetch tooling, provenance/licenses, and validation for JS glue and WASM URLs. Literal import scanning alone does not discover dynamic assets. Verify hosting paths and MIME behavior with the selected initialization method.

Final acceptance requires a foreground rendered map, `?verify=1`, stream switching, dry/receding frames, all required asset responses, and no dense-array main-thread transfer. Hidden automated tabs cannot establish map or worker acceptance. Preserve the real nonmonotonic-stage warning.

Performance gates should be agreed from fresh repeated baseline runs before evaluating candidates: no material first-visible-layer or interaction regression, demonstrated memory improvement for slicing, and measured build/dependency benefit for archive replacement. Record medians and tail behavior rather than a single best run. Any correctness mismatch blocks the default switch regardless of speed.

Rollback remains per backend: pin the previous dependency/build, rebuild immutable site artifacts, and restore the known-good adapter. Never publish a mixed release with missing WASM assets, COG references to absent files, or a static manifest that silently requires a tile service.
