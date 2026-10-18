# Reusing the native depth/extent reader

Load `src/viewer-2d/netcdf.js` as a classic script. It publishes `R2F2D` on
`self` and has no DOM, MapLibre or framework dependency. The existing
`readStack`, `buildIndex`, `paintSparse`, `paintDense`, ramp and clearing helpers
remain available. The worker uses protocol version 1.

## Session API

`R2F2D.createSession(options)` owns one worker and one library of sparse layers.
The host owns its canvas, map source, controls, visibility and opacity. For
example, after loading the reader:

```js
const session = R2F2D.createSession({
  workerFactory: () => new Worker("netcdf-worker.js"),
  onStatus(status) {
    // A new library, cancellation, error or disposal invalidates the old image.
    if (["loading", "idle", "error", "destroyed"].includes(status.phase)) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    statusLabel.textContent = status.phase;
  },
  onFrame(frame) {
    canvas.width = frame.meta.nx;
    canvas.height = frame.meta.ny;
    context.putImageData(new ImageData(frame.data, canvas.width, canvas.height), 0, 0);
    // Place/update a map canvas source using frame.meta.coordinates:
    // [NW, NE, SE, SW] in longitude/latitude. Request a texture upload here.
  }
});
session.load("data/library.nc", { index: 0 });
session.select(2);
session.setMode("extent");
session.setMode("depth");
// On reach change: session.load(otherPublicURL, { index: 0 });
// On panel removal: session.destroy();
```

The host supplies `workerFactory`; resolve the worker URL relative to the
vendored reader, and the data URL relative to the host page. The worker must
have `netcdf.js` and `vendor/h5wasm.js` beside it as in the existing viewer.
Retain the project's LICENSE/NOTICE and h5wasm attribution when redistributing.
No additional runtime file was introduced by the session API.

| Method | Contract |
|---|---|
| `load(url, {index} = {})` | Terminate the old worker, release its cache, advance epoch, create a worker and send one load. Default index is the final **source position**. Mode persists across loads. |
| `select(index)` | Select an integer source position. May be called after load before metadata arrives. Once metadata is known, out-of-range positions throw; an initially out-of-range load selection reports an error when metadata arrives. No clamping, sorting or renumbering. |
| `setMode("depth" \| "extent")` | Default depth. Repaint the selected prepared rung; a pending rung uses the latest mode when ready. Other values throw. |
| `getStatus()` | Current status snapshot. No dense hydraulic arrays. |
| `cancel()` | Terminate the worker, release data, advance epoch and return to idle. Reusable afterward. |
| `destroy()` | Cancel and permanently dispose. Repeat destroy/cancel is harmless; load/select/setMode after destroy throw. |

Optional `rampStops` uses the existing `[fraction,r,g,b]` stop format and defaults
to the viewer's existing blue depth ramp. `extentColor` is three RGB bytes,
default `[66,146,198]`. Extent is opaque over precisely the positive offsets;
it adds no smoothing, polygon approximation, area estimate or new wet mask.
Opacity remains the host's presentation choice.

Status fields are `phase`, `epoch`, `mode`, requested `index`/`flow`,
`displayedIndex`/`displayedMode`, `flowUnits`, `meta`, `prepared`, `complete`
and `error`. Phases are `idle`, `loading`, `preparing`, `ready`, `error`,
`destroyed`. During a pending selection the previous frame may remain visible;
the displayed fields identify it separately from the requested selection.
Before metadata, `flow` is null. `ready` means a frame can be presented, not
that the host has uploaded it or that the data is scientifically qualified.

`onFrame` receives `epoch`, stable `index`, `flow`, `mode`, `meta`, `stats`,
`cells`, `maxDepth` and RGBA `data`. `data` is a **borrowed**
`Uint8ClampedArray` reused for later frames. Copy it if retaining a frame;
do not modify or transfer its buffer. Treat metadata/stats as read-only too.
Callbacks are synchronous. Status is delivered before its frame, and a
synchronous cancel/reach change from that callback suppresses the old frame.
Hosts retaining frames or scheduling their own map callbacks must additionally
check the epoch/selection against the current status when using those frames.

Depth presentation waits for all sparse layers and the worker's `done`, so
`maxDepth = max(1, ceil(maximum positive depth across the whole library))`
is fixed before the first depth frame. A low-index flow may be deeper than
the final flow. Extent can present a requested layer as soon as it arrives.
Its reported `maxDepth` is provisional until `complete` is true; its color
does not depend on that value. Switching modes or revisiting prepared rungs
requires no fetch, decode, new worker or dense scan. The legacy page and
low-level worker clients retain their own presentation scheduling.

## Wet, dry and missing data

Depth is the unpacked depth variable, or unpacked WSEL minus unpacked terrain.
Declared fill in either required input and nonfinite physical depths are
nodata. Missing terrain in a WSEL file is an error, not a dry result.

| Population | Meaning |
|---|---|
| `stats.valid` | Finite, non-fill depths, including zero and negative values; signed min/max/mean use this population. |
| `stats.positive` | Depth strictly greater than zero; the only cells painted in either mode. |
| `stats.negative` | Valid depth below zero. |
| `stats.wet` | Historical alias for **valid**; retained for old callers. Use positive for inundation. |
| `cells.wet` | `stats.positive`. |
| `cells.validDry` | `stats.valid - stats.positive`. |
| `cells.nodata` | `nx * ny - stats.valid`; no per-cell cause is inferred. |

`R2F2D.layerCells(meta, stats)` exposes these counts independently.
`R2F2D.paintExtent(px, layer, colorU32)` writes the existing positive offsets
into a caller-owned Uint32 pixel buffer. Like `paintSparse`, clear the previous
layer with `clearSparse` first. `createSession` does that itself, including
disjoint, receding and completely dry/nodata frames. Counts are grid cells,
not geographic area; EPSG:3857 cell areas are not equal ground areas.

## Compatible file/writer contract

The reader accepts NetCDF4/HDF5 with the existing public layout:

- A numeric `depth[flow,y,x]`, or `wsel[flow,y,x]` with matching
  `terrain[y,x]`. `01_type` may name `depth` or `wsel`; otherwise the reader
  finds those variable names. No separate polygon/extent variable is required.
- CF `scale_factor` (positive, finite; default 1), `add_offset` (finite;
  default 0), and optional `_FillValue` on each input. Omitted fill does not
  imply zero or any other nodata value. h5wasm returns raw values, which the
  reader unpacks. Packed uint16 remains the efficient existing path; floating
  depth with declared fill is also supported by the numeric path.
- Declared vertical `units`: `ft`, `foot`, `feet`, or `m`, `meter(s)`,
  `metre(s)`, case-insensitive. WSEL and terrain units must normalize to the
  same unit. Values are **not converted**. Missing/unsupported units fail;
  they no longer silently become feet. `meta.units` preserves the declaration;
  `meta.depthUnits` normalizes it to `ft` or `m`.
- Finite `flow` values, exactly one per layer, in the original source index
  order. Flow units are reported verbatim or null when absent, never guessed
  as cfs. A consuming catalog must separately verify units, flow matching and
  rung identity; this reader does not infer hydraulic equivalence.
- `spatial_ref.GeoTransform` with six finite values, positive pixel width,
  negative pixel height and zero rotation, covering a positive-size grid.
  It describes cell corners, not center-coordinate extents.
- Declared EPSG:3857 in `spatial_ref` attributes `epsg_code`, `spatial_ref`
  or `crs_wkt`. Accepts an EPSG code/string or WKT1/WKT2 with a final root
  EPSG authority/ID. Conflicting declarations, missing/unsupported CRS and
  rotated/reversed grids fail before geographic corners are calculated.
  This is a bounded CRS check, not a general WKT parser or reprojection engine.

Metadata adds `crs`, `geoTransform`, `depthUnits`, `maskPolicy`; existing
field names and protocol version remain unchanged. Supported, explicitly
georeferenced ras2fim-2d files retain their data, indices and ramp behavior.
Files previously accepted through missing-unit or unchecked-CRS assumptions
now intentionally fail with a compatibility error. No guessed metadata mode
is provided.

An EPSG:5070 source cannot be placed directly on this Mercator canvas. An
external producer may explicitly create a derived EPSG:3857 display stack,
recording the source artifacts/CRS, declared resampling (nearest for discrete
wet-mask preservation), output grid, packing precision, units and per-rung
provenance/holds in its publication metadata. Label that product as a derived
display grid, not native alignment. Reprojection can change a pixel footprint;
the producer and consumer must qualify that difference. No conversion,
scientific reinterpretation or hydraulic acceptance is performed by this API.

## Worker compatibility and acceptance

The version 1 exchange stays `load`/`prioritize` → `meta`/`layer`*/`done` or
`error`, with the same sparse transferable arrays and source indices.
An optional `{type:"cancel", epoch}` cancels only that worker epoch. Replacing
a load aborts its fetch; a private generation guard also invalidates old fetch
completions and MessageChannel preparation tasks, even if epochs are reused.
Synchronous WASM decode cannot be interrupted by a worker message; session
cancellation terminates the worker instead. Dense main/terrain arrays never
cross the worker boundary and are released after preparation.

Run `node --test tests/*.test.mjs` and the Python/conventions commands in
[the test guide](../tests/README.md). The API suite uses synthetic stacks,
fake HDF5 objects and a worker VM harness. These prove control flow and pixel
semantics, **not real h5wasm decoding or data qualification**. Before adopting
a new producer, independently check an actual immutable NetCDF in a real
browser: metadata/units/CRS, exact flow order, depth and extent masks against
source references, both modes, repeats, pending selection, reach changes and
disposal. Preserve any unresolved hydraulic/datum/approval holds separately.


## Indexed dense decoding (whole-file transport)

`R2F2D.openStack(h5, arrayBuffer)` accepts the same validated file as
`readStack`, but keeps its HDF5 file open. `stack.readLayer(sourceIndex)` uses
h5wasm 0.10.3 `Dataset.slice([[index,index+1],[],[]])` to decode one profile.
It returns a disposable one-profile dense stack; pass **0** as its index to
`buildIndex` or `paintDense`. The source stack preserves the original metadata
and has `wsel=null`. `buildIndex(sourceStack, sourceIndex)` also reads that one
profile directly. Indexes are checked and never sorted or clamped.
`stack.close()` closes/unlinks the MEMFS file idempotently; later reads fail.
The caller owns returned arrays. Terrain for WSEL is read once and shared.
Legacy `readStack` and its dense output remain unchanged.

The worker now uses this indexed reader while preserving protocol version 1,
existing preparation order and all-layer session behavior. Metadata excludes
`readLayer` and `close` functions. It closes the file after preparation,
replacement, cancellation or a decode/preparation error.

Optional `profile[flow]` contains one nonempty string label per source position;
`meta.profileNames` preserves that order. When physical discharge is unknown,
`flow` must contain exactly zero-based source positions with `units="1"` and
`axis_semantics="profile_index"`. `meta.axisSemantics` exposes that distinction.
Those numbers are profile indices, never cfs. Existing physical flows/units
remain unchanged. Consumers must bind profile identity independently from
numeric discharge and must not label an index as a physical flow.

This change provides **HDF5 hyperslab decoding, not HTTP range transport**.
The worker still fetches the entire compressed NetCDF, copies it into MEMFS,
and ultimately retains every sparse profile on the main thread. WASM heap
high-water allocation, input copies, per-plane copies, terrain and all sparse
layers contribute to memory. At 4608x4608, one float32 plane is 84,934,656 bytes;
86 dense planes would be 7,304,380,416 bytes. Avoiding that dense cube is useful,
but an all-wet sparse library can still be larger. Large-reach publication
requires a separately qualified bounded cache/on-demand session and browser
memory limits; this API alone does not establish that qualification.

`tests/netcdf-h5wasm.test.mjs` checks a small real NetCDF4 fixture using the
actual pinned IIFE runtime when `H5WASM_BUNDLE` names that file. It compares
sliced/dense positive offsets, depths and signed statistics. Normal tests skip
that test when the runtime is absent. These are actual WASM decode checks in
Node, not real-browser rendering, network or large-library acceptance.

## Bounded on-demand session (opt-in, worker protocol 2)

Large per-reach catalogs can opt into a session that never prepares or retains
every profile:

```js
const session = R2F2D.createSession({
  workerFactory, onFrame, onStatus,
  bounded: {
    displayMaxDepth: 25,          // required, file depthUnits, > 0
    displayRangeSource: "catalog depth_display_max", // optional provenance
    cacheSize: 3,                 // optional, integer 1..16, default 3
    maxCompressedBytes: 1.5e9,    // required, positive integer
    maxPlaneCells: 33554432       // optional, default 2^25
  }
});
```

Without `bounded` nothing changes: v1 load message, every profile prepared,
depth waits for `done`, ramp from the library maximum, `complete` as before.
`readStack`, `openStack` and `readLayer` are unchanged.

**Display range is not a statistic.** `displayMaxDepth` is the top of the
fixed DISPLAY colour range, supplied by the catalog producer; it is never
inferred from loaded profiles (that would need all of them). Bounded frames
carry `maxDepth` (equal to the display maximum, for compatibility) and
`displayRange {min: 0, max, units, source}`. `frame.stats` stays the selected
profile's scientific signed statistics; `stats.max` may exceed the display
maximum, and such cells clamp to the last ramp colour. Never present the display
maximum as a measured depth.

**Memory.** The session holds at most `cacheSize` prepared sparse layers in an
LRU (the displayed layer is never evicted while on screen) plus one
`nx*ny*4`-byte pixel buffer. Evicted layers are dereferenced; reselecting one
decodes it again. Depth mode paints as soon as the selected profile arrives.
`complete` is always false; `prepared` is the cached count;
`status.bounded = {cacheSize, cached, displayMaxDepth, pending}` lists cached
source indices least-recent first.

**Requests.** After `meta {protocol: 2, onDemand: true}` the worker decodes
nothing until `{type: "request", epoch, index, request}`. One hyperslab is read
per serviced request; requests that arrive before the next task boundary are
coalesced to the latest. The session accepts a layer only for the current epoch
and its single outstanding request id: superseded, duplicate and late layers are
dropped, not cached. Selecting a cached profile sends nothing and supersedes any
request in flight; reselecting the in-flight profile sends nothing. Cancel,
reach change and destroy terminate the worker (closing the HDF5/MEMFS file) and
release the cache and pixels. A worker answering a bounded load with protocol 1
is reported as `bounded mode requires worker protocol 2`.

**Transport and guards.** The whole compressed file is still fetched and copied
into MEMFS for the session's lifetime; peak is about twice the compressed size
while it is written. Decoding one profile reduces decode memory, **not network
bytes**. The worker refuses a declared `Content-Length` above
`maxCompressedBytes` before buffering, cancels a streamed body as soon as it
crosses the limit (`phase: "fetch"`), and refuses grids whose `nx*ny` exceeds
`maxPlaneCells` before any hyperslab (`phase: "decode"`). Per request, the
transient cost is one decoded plane (`nx*ny` x element size) plus the sparse
layer (up to 8 bytes per positive cell). At 4608x4608 the pixel buffer and one
float32 plane are each 84,934,656 bytes and one all-wet sparse layer is at most
169,869,312 bytes, so three cached layers are bounded by about 510 MB worst case
— in addition to the compressed file in MEMFS, which only `maxCompressedBytes`
bounds.

**Lazy HTTP range reading is not used.** The pinned h5wasm 0.10.3 IIFE build
does contain Emscripten `FS.createLazyFile`, inspected in the bundle source. It
is unsuitable here: it uses synchronous XHR (worker only, so a cancel cannot be
serviced mid-read), caches every 1 MiB chunk it touches with no eviction, does
not verify 206 responses or a stable ETag across chunks, silently degrades to a
single whole-file chunk when `Accept-Ranges` is not exposed through CORS, and
reports failures through the module's fatal `abort()`. A safe range transport
needs a bounded chunk cache, response validation, cancellation and recoverable
errors; it is not provided.

`tests/bounded-session.test.mjs` covers the session and worker protocol on
synthetic inputs. `tests/netcdf-h5wasm.test.mjs` runs the real worker source and
the real session against the actual runtime and the small real NetCDF4 fixture
when `H5WASM_BUNDLE` is set. Neither qualifies a large real reach, a browser
heap limit or fleet data; that acceptance remains with the integrating
dashboard.


### MAIN bounded-reader qualification amendment

CF `grid_mapping` names the CRS variable (including `crs`). Legacy files without
that declaration use `spatial_ref`; invalid explicit declarations fail closed.
`bounded.maxCacheBytes` is a positive integer, default 134217728 (128 MiB),
limiting retained sparse offsets plus depths in addition to `cacheSize`.
Status exposes `cachedBytes` and `maxCacheBytes`. A single oversized profile
fails before display. This ceiling excludes in-flight transfer, decoded plane,
compressed fetch/MEMFS, canvas and GPU buffers; it is not a total heap guarantee.
Production compressed/plane/display budgets and largest-reach browser evidence
remain required. The default is a conservative guard, not a measured optimum.
