# NetCDF viewer performance — what was implemented, and what it measured

**Date:** 2026-09-10
**Implements:** [2026-09-09-netcdf-viewer-performance.md](2026-09-09-netcdf-viewer-performance.md)
**Status:** P-1 through P6 shipped

The 2026-09-09 note recorded decisions and explicitly implemented none of them.
This records what happened when they were built, including the parts the note
had wrong. That note is left as written — it is a dated record, not
documentation.

---

## Results

Chrome, `wb-2427466` (1963 × 1331, 15 flow layers, 2.35 MB).

| | before | after |
|---|---|---|
| Paint one layer | 13.0 ms | **0.8 ms** (16.3×) |
| Slider step, end to end | 25–42 ms | **~3.6 ms** |
| Held on the main thread | 83.6 MB dense | **20.2 MB** sparse index |
| JS heap | ~135 MB | **35 MB** |
| Decode | 134–148 ms, blocking | 168 ms, in a worker |
| Prepare all 15 layers | — | 213 ms, once |

Paint figures are 75 samples per path, interleaved in one page so machine state
cancels. Break-even for the preparation cost is ~20 slider steps.

## Corrections to the 2026-09-09 note

| Claim | Correction |
|---|---|
| "+2.9% file size" for per-layer chunking | Used the `wsel` denominator. It is **0.87%** of the whole file. |
| "20 MB file → tens of megabytes saved" | **~3 MB**. |
| Grid 2,613,353 cells | 1963 × 1331 = **2,612,753**. |
| D-4 "clear the canvas once, then write only wet cells" | **Wrong** — leaves stale flooding when flow decreases. |
| Terrain shuffle "13%" | 13% of terrain = **~8.7%** of the file. |
| Sparse index 29.1 MB worst case | Total wet cells across all layers measured at **2,519,612**, so **20.2 MB**. R14 closed. |
| "Fold statistics into the paint pass" | Would have **changed the reported numbers** — see below. |

## What the plan got wrong, found by building it

**"Wet" meant two different things.** `depthStats` counted every valid cell;
`paintDepth` counted only `depth > 0`. Folding one into the other would have
silently redefined the panel's statistics. They are now one pass producing two
distinct populations: `positive` is what gets painted, `valid` is what the
signed min/max/mean describe.

**Progressive decode was dropped.** h5wasm does not expose chunk shape to JS, so
chunk-group reads would mean hardcoding `[8,666,982]` — wrong for the next file
and failing as a *slowdown* rather than an error. The worker made the decode
non-blocking, which was the actual goal; preparation is what streams instead.

**`setTimeout(fn, 0)` is not a task yield in a background tab.** It is clamped
to ~1 s, which turns one-layer-per-task into 15 seconds for 15 layers. A
`MessageChannel` round trip is not clamped and is now the yield.

**The advertised `depth` variable was never usable.** The reader probed for
`wsel` or `depth` and then subtracted terrain from either. A depth of 2.0 ft
over terrain at 10.0 ft displayed as −8.0 ft and drew transparent. Now two real
branches, verified against a synthesised fixture that paints byte-identically to
its wsel original.

**Packing was narrower than CF requires.** `add_offset` was never read, and a
missing `_FillValue` became `Number(null) === 0`, masking valid terrain at
elevation zero. The integer fast path is also only valid when both variables are
packed alike; otherwise `w − t` subtracts incomparable units. Detected now, with
a float fallback.

## The remaining cost is the texture upload

Paint is 0.8 ms; a step is ~3.6 ms. What is left is `putImageData` and
MapLibre's canvas-source upload of the full 10.45 MB texture — and
`CanvasSource.pause()` calls `prepare()` again while `_playing` is still true,
so it may upload **twice** per step. The panel now times paint, canvas copy and
decode separately so this is measurable rather than arguable.

That, not the CPU paint, is what a GPU path (D-5) would remove. It stays
deferred until the separated timings justify it.

## Still true, still deferred

Range reads (D-0/D-1) remain the wrong optimisation at this file size —
terrain is 69% of the file and every depth needs it. The upstream asks
(per-layer chunking, terrain shuffle) are unchanged and unraised; the
`--deep` validator reports chunk shape so the day chunking lands, it says so.

## Verification that gates this

`?verify=1` runs the retained dense renderer inside the worker and asserts the
sparse output is byte-identical, per layer. Run across three streams including
the depth fixture, forwards, backwards and with a wraparound jump: **108 steps,
zero mismatches.**

`pipeline/validate_netcdf_release.py` gates the site: **76 checks**. Proven to
catch a missing worker file, a stray unlisted `.nc`, and a manifest that
disagrees with its data.

## Environment note

Workers created *after* page load are never scheduled in a hidden/automated
Chrome tab — verified with a bare worker that only calls `postMessage`. Stream
switching therefore cannot be exercised in that context; it was verified by
making each stream the initial load instead. This is a testing constraint, not a
product defect, but it costs an hour if you meet it without knowing.
