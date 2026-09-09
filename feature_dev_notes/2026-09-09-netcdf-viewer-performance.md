# NetCDF viewer performance — architecture decisions

**Date:** 2026-09-09
**Scope:** `prototypes/netcdf-2d/` (the browser-native ras2fim-2d reader)
**Status:** decisions recorded, none implemented yet

---

## Headline: range reads are the wrong optimization at this file size

The work started from "avoid reading the full file." Measurement says that is
not where the cost is. **Terrain is 69% of the file, and every depth calculation
needs all of it.**

| | compressed on disk | share |
|---|---|---|
| `terrain` (1331 × 1963, **one chunk**) | 1,606,966 B | **69%** |
| `wsel` (15 × 1331 × 1963, 8 chunks) | 714,249 B | 31% |
| HDF5 metadata | ~32 KB | 1% |
| **file total** | **2,353,803 B** | |

A range-reading client that fetched only what it needs to draw one flow layer
would still pull terrain (1.61 MB) plus one flow-chunk group (398,522 B) —
**2.01 MB of 2.35 MB, an 85% fetch for a 15% saving.** The complexity of a
range-read path buys almost nothing here.

This inverts the intuition from the 1D COG path, where tiling is essential. It
holds only while files are single-stream and a few megabytes. See
[Revisit triggers](#revisit-triggers).

### Measurements this rests on

Chrome, GitHub Pages, `filter_wsel_wb-2427466.nc` (1963 × 1331, 15 flows);
decode timings re-checked in CPython/h5py.

| | |
|---|---|
| Transfer: data | 2.35 MB (already internally compressed, no HTTP encoding) |
| Transfer: h5wasm | **1.12 MB gzipped** (5.7 MB uncompressed — the wire cost is not the problem) |
| Decode all 15 layers + terrain | 134–148 ms → **83.6 MB resident** |
| Decode terrain only | 15 ms |
| Decode one layer only | **51 ms** — worse than it should be, see D-1 |
| Paint one layer (CPU) | 15 ms |
| Slider step end to end | 25–42 ms |
| Wet cells, top layer | 323,292 of 2,613,353 (**12.4%**) |

---

## Decisions

### D-1 — Per-layer chunking is the highest-value change, and it is upstream

`wsel` is chunked `[8, 666, 982]`: 8 flows deep. Reading one layer inflates 8,
which is why a single-layer decode (51 ms) costs more than a third of decoding
all fifteen (134 ms). Every lazy-loading strategy is blocked on this.

Rechunking measured, gzip-5, same data:

| chunking | bytes | vs current |
|---|---|---|
| `[8, 666, 982]` (current) | 714,249 | 1.00× |
| **`[1, 1331, 1963]` (per layer)** | **734,605** | **1.03×** |
| `[1, 512, 512]` (tiled) | 857,624 | 1.20× |
| `[1, 512, 512]` + shuffle | 1,095,419 | 1.53× |

**Decision:** ask upstream for `[1, 1331, 1963]`. It costs **+2.9% file size**
and makes a single-layer read ~5× cheaper. Do *not* ask for spatial tiling or
shuffle on `wsel`: it is mostly fill, deflate rewards the long runs, and both
options make it materially bigger.

Until it lands, decode everything at once — it is the cheaper path today.

### D-2 — Do not replace `wsel` + `terrain` with a stored `depth`

Tempting, since the viewer only ever renders depth. Measured: storing
`depth` as `uint16 [1,512,512]` is **2,347,752 B against 2,321,215 B** for
`wsel` + `terrain` — **1.01×, no saving at all**. Depth is a real-valued field
over the wet area and carries more entropy than a smooth WSEL surface plus a
separately-compressed DEM.

**Decision:** rejected on measurement. It would also discard WSEL, which has
independent value. Keep the native product.

### D-3 — Every slider step currently makes two full passes; make it one

`render()` calls `paintDepth()` and then `depthStats()`, and each scans all
2.6 M cells. The statistics are also recomputed on every step for values that
never change for a given layer.

**Decision:** compute per-layer statistics **once at load** (or precompute into
the manifest) and fold the wet count into the paint pass. Roughly halves
per-step CPU for a few lines of change.

### D-4 — Paint from a sparse wet-cell index, not a dense scan

Only **12.4%** of the grid is wet at the top layer, and less below it. The paint
loop nonetheless touches all 2.6 M cells every step, writing `alpha = 0` across
2.3 M dry ones.

**Decision:** after decode, build a per-layer index of wet cell offsets. Clear
the canvas once, then write only wet cells. Expected ~8× less per-step work
(15 ms → low single digits) with no GPU dependency and no change to output.

### D-5 — Move depth to the GPU only after D-3 and D-4

A WebGL custom layer with `wsel` and `terrain` as integer textures would make
the slider a uniform change and remove the ~10 MB RGBA re-upload per step that
the MapLibre `canvas` source performs.

**Decision:** deferred. It is the largest single win but also the largest change
— a custom layer, texture formats, and its own fallback path. D-3 and D-4 get
most of the benefit for a fraction of the risk. Revisit if per-step cost still
matters after them, or when animating continuously rather than stepping.

### D-6 — Decode progressively, off the main thread

First paint needs terrain (15 ms) and one layer, not all fifteen (134 ms).
The decode also currently blocks the UI thread.

**Decision:** decode terrain + the initially-shown layer first, paint, then
decode the remainder during idle. Move decode into a Web Worker and transfer
the `ArrayBuffer` back rather than copying. Cuts perceived load roughly 4× and
removes the jank. Note this only helps materially once D-1 lands; today a
single-layer decode is 51 ms of the 134 ms total.

### D-7 — Stop disabling the HTTP cache

The prototype fetches with `cache: "no-store"`, which defeats browser caching
entirely — every revisit re-downloads 2.35 MB. Published NetCDF objects are
immutable in practice.

**Decision:** use default caching, and set long `max-age` + `immutable` where
the host allows it. GitHub Pages caps at `max-age=600` and is not configurable;
an S3/CloudFront deployment should set this properly. Free win, one word.

### D-8 — Terrain shuffle: a small upstream ask, bundled with D-1

`terrain` is one unchunked block with no shuffle filter. Measured:

| | bytes | vs current |
|---|---|---|
| current (1 chunk, no shuffle) | 1,606,966 | 1.00× |
| **shuffle on** | **1,403,030** | **0.87×** |
| shuffle + 512² chunks | 1,377,454 | 0.86× |

**Decision:** worth ~200 KB (13%) on the dominant component, but not worth a
separate request. Bundle with D-1.

### D-9 — Terrain is per-stream and cannot currently be deduplicated

Each stream's NetCDF carries its own terrain clip on its own grid — 1331 × 1963
for `wb-2427466`, 103 × 179 for `wb-2427467`. Streams from the same 2D model
area therefore ship overlapping terrain repeatedly, and at 69% of file size that
dominates any multi-stream catalog.

**Decision:** no client-side fix exists; the grids differ, so there is nothing
to share. Record it as the structural question for catalog-scale work: a shared
parent terrain per model area, referenced by each stream, would cut a catalog
of *n* co-located streams by most of *n* × terrain. That is an upstream format
change with real consequences for file self-containment, and should not be
proposed without a concrete catalog to size it against.

### D-10 — Catalog scale is a separate problem from single-stream speed

Today: one stream, loaded whole, held whole (83.6 MB). A HUC-scale catalog needs
viewport-driven loading and eviction.

**Decision:** when it arrives, drive loading from the manifest `bounds` already
present, load streams intersecting the viewport, and evict by LRU under a memory
budget. Do not build this speculatively.

### D-11 — Revisit dropping h5wasm only after D-1

A kerchunk-style byte-range sidecar plus `zarr.js` and a small inflate would
replace h5wasm's 1.12 MB gzipped with roughly 150 KB, and make range reads
possible without an HDF5 parser.

**Decision:** not now. It buys ~1 MB of cold load and a range-read capability
that D-1's absence makes useless, at the cost of a generated sidecar per file
and a second format contract. Reconsider once per-layer chunking exists and if
cold start is measured to matter.

---

## Sequence

Cheapest first; each is independently shippable.

1. **D-7** cache header — one word.
2. **D-3** single pass, stats at load — small, halves per-step CPU.
3. **D-4** sparse wet-cell paint — contained, ~8× less per-step work.
4. **D-6** worker + progressive decode — removes jank, cuts perceived load.
5. **D-1 / D-8** upstream chunking + shuffle ask — enables 6 and 11.
6. **D-5** GPU path — only if still warranted.
7. **D-10 / D-9** catalog scale — when there is a catalog.

## Revisit triggers

The "no range reads" decision (D-0, implicit) is correct **only** under current
conditions. Reopen it when any of these becomes true:

- a single stream file exceeds roughly 20 MB, where the 15% saving becomes
  tens of megabytes;
- per-layer chunking lands (D-1), making selective reads actually selective;
- terrain is deduplicated to a shared object (D-9), at which point `wsel` is the
  bulk of what a client fetches and range reads become the whole game;
- a viewer needs many streams at once (D-10) rather than one.

## What was measured versus assumed

Measured: all byte counts, all timings, all rechunking and shuffle trials, the
gzip transfer size of h5wasm, the wet-cell fraction. Assumed: that D-4's sparse
paint scales with wet fraction (plausible, not benchmarked) and that D-5's GPU
path removes the texture upload (true of the technique, not yet measured here).
