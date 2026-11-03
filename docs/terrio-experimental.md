# Experimental Terrio backends

h5wasm and GDAL remain the defaults. This branch adds explicit experiments;
it does not migrate a production release or change hydraulics, packing, flow
ordering, profile identity, normalization, or the shared colour ramp.

## Browser decoder and slices

Build a single-threaded Terrio web package with the existing `netcdf-hdf5`
feature. Package it into a site explicitly:

```powershell
python -m pipeline.fim2d.site <nc-directory> --out <site-directory> --terrio-package <terrio-web-package>
python -m pipeline.fim2d.validate <site-directory> --deep
```

Open `?decoder=terrio&verify=1` for full-stack differential behavior or
`?decoder=terrio-slices&verify=1` for one decoded flow layer plus terrain.
Without the query parameter, h5wasm is used. An excluded/missing decoder fails
explicitly; it never retries a different decoder. The site ships glue, WASM,
declarations, notices and a SHA256 asset inventory. No COOP/COEP is required;
serve `.wasm` as `application/wasm`.

The adapter feeds the existing reader's metadata/geodesy/packing validation.
Sliced layers feed the same `buildIndex` and rendering functions. Dataset and
view handles stay worker-local, are freed on completion, error or cancellation,
and only JS-owned sparse output buffers transfer to the main thread. Superseded
fetches abort; worker termination is the immediate synchronous-decode cancellation
mechanism. Inputs are still whole-file downloads; no remote range API is implied.

Rendering uses the public Float32 sparse-layer depth representation, then clamps
and floors the normalized value into the 256-bin ramp. Dense verification reads
native values independently and rounds once to that display precision before
normalization. Previously its raw-domain arithmetic could select a neighboring
bin on real data. The sparse display and signed-statistics precision are unchanged.
Fixed expected-bin tests and exact full RGBA comparisons enforce this contract;
there is no pixel tolerance. Verification clears both scratch images before reuse.

Run the real decoder job separately from dependency-free Node tests:

```powershell
python tests/terrio-fixtures.py
$env:PLAYWRIGHT_MODULE = '<path-to-playwright-module>'
node tests/terrio-differential.mjs
$env:TERRIO_FIXTURES = '<local-directory-of-real-pilot-nc-files>'
node tests/terrio-differential.mjs
```

The job exercises native values/types, ordered metadata, signed statistics,
sparse offsets/depths/bounds, exact RGBA, malformed inputs, repeated worker loads
and all decoder modes. `peakDecodedBytes` measures simultaneously referenced
decoded JS typed arrays. It excludes encoded bytes, WASM heap/caches, sparse
accumulation, verification scratch, allocator overhead and browser RSS. Timing
`prepare` includes per-layer decode for the slice path; `firstPreparedMs` is not
first visible paint. Do not call these counters a leak or total peak-memory test.

## PMTiles trial

`python -m pipeline.fim1d.depth_pmtiles ... --backend terrio` retains the exact
existing COG-to-RGBA colourization, then invokes Terrio's lazy generic archive
writer. The default remains `--backend gdal`. Both paths now stage beside the
destination, validate the PNG archive header and replace atomically. Reports
record the backend version and options; runtime behavior still follows manifests.

Compatibility requires exact decoded PNG pixels/alpha, coverage, zooms, bounds
and transparent omission. The fork's independent `OVERVIEW_RESAMPLING` control
lets the trial use base BILINEAR plus overview AVERAGE. Its minimum zoom also
matches the available levels of a reopened GDAL MBTiles raster (including the
first level below 256 pixels in both dimensions). The synthetic non-empty cases
match exactly. The fixed fork also matches all 72 pilot profiles across every
RGBA channel, coverage, bounds and zooms through the rebuilt Python binding.
This is bounded fixture/corpus evidence, not universal reprojection parity.
Artifact pins and validation of the separate reconciliation branch are recorded
in the handover. GDAL remains default pending performance/adoption acceptance.
All-dry profiles use a valid PMTiles v3 archive with one transparent zoom-zero
sentinel, source bounds, and explicit `empty: true` metadata. This works with
standard readers and overzooming; it paints no water. Zero-entry archives were
rejected by the independent Go verifier and are not used. The manifest records
`depth_empty`; publication checks its payload/directory and rejects contradictory
positive source extrema. All-nodata rasters use `(0, 0)` only as an explicitly
verified normalization bound, never as a claimed observed sample. Failed reads
on valid data still fail. Archive replacement is atomic; a failed site rename
restores the previous release. GDAL remains the non-empty tile default.

## Bounded COG writer trial

`finish_cog(..., writer_backend='terrio')` is experimental. `finish_cog` still
builds the existing area-matched or mode overview arrays, stamps metadata, checks
bounds, invokes the independent validator, and replaces atomically. Terrio only
writes supplied base/overview arrays. Other resampling methods are rejected for
this trial; no Terrio area-matched algorithm is substituted. GDAL remains default.

The optional hook is an explicit local extension to the vendored module. Before
any production adoption, coordinate the same generic hook with `clb_lwi_webmap`;
the two pre-existing vendor divergences remain the documented envelope/prefix.
No edits to that other repository were made in this assignment.

Run `tests/terrio-publication.py` in `lwi-gdal` with the local CLB Terrio Python
extension and `pmtiles` CLI available. It reports compatibility failures without
turning them into successes. Acceptance evidence and exact source/artifact pins
are recorded in the feature handover, not inferred from the backend name.
`tests/terrio-real-publication.py all` compares every populated tile of the local
72-profile pilot, using its exact library maximum. `--compare-only` checks saved
archives without rebuilding. `tests/terrio-real-cog.py` validates a real WGS84
profile through both writers. Lossy comparisons allow the nominal 0.01 codec
bound plus Float32 readback rounding; the exact observed errors are reported.
