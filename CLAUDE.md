# Agent notes — ras2fim-viewer-wasm

Read `README.md` first. This file records the things that are easy to get wrong
and expensive to notice later.

## Environments: there are two, on purpose

| What | Interpreter | Why |
|---|---|---|
| `pipeline/*` | `conda activate lwi-gdal` (Python 3.11, GDAL 3.13 bindings) | The area-matched overview builder writes overview levels directly. Only the `osgeo` API exposes that; rasterio has no equivalent. |
| `serve/dev_tiles.py` | the plain workstation interpreter (rasterio + Pillow) | It only reads COGs and encodes PNGs, and `lwi-gdal` has neither rasterio nor Pillow. |

Do not "simplify" this into one environment by rewriting `cog_postprocess.py` on
rasterio. The overview algorithm is the reason the module exists.

The GDAL on `PATH` at `C:\Program Files\GDAL` is **2.1.0 (2016)** and predates
the COG driver entirely. Never invoke it. `pip install gdal` has no wheel for
the workstation's Python.

## Things that were already wrong once

- **`ComputeRasterMinMax(True)` reads the overview pyramid.** These overviews
  carry the mean of each coarse cell's wet contributors, so the approximate path
  reported the pilot library's peak as 17.5 ft instead of 31.8 ft. The colour
  ramp is built from that number, so it silently clipped the deepest water on
  every profile. Always pass `approx_ok=False` on a depth grid.
- **Gating UI initialization on `map.on("load")`.** MapLibre fires `load` only
  after a first render, and `requestAnimationFrame` is throttled to zero in a
  background tab — so the entire panel sat dead with a permanent "Catalog
  loading" label and no way to tell why. Controls and the manifest fetch now run
  immediately; only style-touching work goes through `whenMapReady`. Anything
  calling `map.getStyle()` must check `map.isStyleLoaded()` first, because it
  throws before the style exists.
- **`stage_interval_ft` is not a property of a reach.** Profiles are uniformly
  spaced in depth at the model's *controlling* cross section only. The manifest
  records `profile_spacing` as prose at the model level and a per-reach observed
  `stage_step_ft` {min, median, max}.

## Contracts that must not drift

- **The profile index is the join key.** `Depth (flow<N>_ft)`, `profile_num` in
  the rating curves, and `profile_num` in the geocurves are the same zero-based
  RASMapper `ProfileIndex`. Nothing may reorder or renumber it.
- **Layer names in `fim1d/pmtiles.py` match `VECTORS[].id` in `app.js`.**
  Renaming one without the other produces an empty layer and no error anywhere.
  `fim1d/validate.py` catches it.
- **`finish_cog()` is the only way a COG gets written.** It stamps the codec,
  the LERC tolerance, and the overview method into the artifact, validates the
  layout with a real validator, and replaces the destination atomically. Never
  reopen a finished COG with `GA_Update` to add metadata — GDAL either refuses
  or produces a file that is no longer a COG.
- **Keep `cog_postprocess.py` in step with `clb_lwi_webmap`.** It is vendored.
  The deliberate divergences are exactly two: `DEFAULT_ENVELOPE` is CONUS-wide
  rather than Louisiana, and `METADATA_PREFIX` is `FIM`. Anything else should be
  ported back and forth rather than allowed to fork.

## NetCDF viewer contracts

- **`VIEWER_FILES` must list every file the page loads.** Nothing references
  `netcdf-worker.js` but `app.js`, so omitting it builds cleanly and 404s at
  runtime. `fim2d/validate.py` scans the shipped JS for `new Worker`
  and `importScripts` literals precisely to catch this.
- **`paintSparse` must agree with `paintDense` byte for byte.** The dense
  renderer is retained only as that oracle. `tests/netcdf-reader.test.mjs` runs
  it in Node on synthetic layers covering fill, zero, negative, positive, empty
  and receding flow; `?verify=1` runs it in a real browser on real data. The
  first is the guard on every change, the second is the acceptance step before
  a deploy.
- **The dense arrays never leave the worker.** Posting `stack.wsel` is an 83 MB
  structured clone that shows up as unexplained main-thread jank, not an error.
- **"Wet" is two populations.** `positive` is what gets painted; `valid` is what
  the signed statistics describe. Do not merge them.
- **`setTimeout(fn, 0)` is not a task yield** in a worker owned by a background
  tab -- it is clamped to ~1 s. Use the `MessageChannel` yield.

## Tests

```sh
node --test "tests/*.test.mjs"              # browser reader, no dependencies
python -m unittest discover -s tests -t .   # pipeline, needs numpy + netCDF4
```

Under a second each, and neither needs a browser, a tile server or GDAL. Run
both before committing anything under `src/viewer-2d/` or `pipeline/`.

Two things they encode that are easy to undo by accident:

- **`netcdf.js` must stay loadable outside a browser.** The tests load it
  through `node:vm` with `self` bound the way a worker binds it. If that stops
  working, the sparse-vs-dense oracle goes back to being a manual `?verify=1`
  step and the 16x paint optimisation loses its only cheap guard.
- **`tests/fixtures/geodesy_cases.json` is a two-language contract.** Change a
  rule in `pipeline/common/geodesy.py` and the JavaScript copy fails, and the
  other way round. Regenerate with `python -m tests.regenerate_geodesy_fixture`
  only when the rule itself is meant to change.

CI (`.github/workflows/tests.yml`) runs exactly these two commands. The 1D
pipeline is not in CI: it needs the GDAL bindings and real ras2fim output, so
its gate stays the manual `--deep` run below. See `tests/README.md`.

## Before calling a build done

```powershell
conda activate lwi-gdal
python -m pipeline.fim1d.validate --frontend src/viewer-1d --deep
```

For the 2D viewer -- no GDAL, plain interpreter:

```powershell
python -m pipeline.fim2d.site <dir-of-nc> --out site/
python -m pipeline.fim2d.validate --site site/ --deep
```

454 checks pass on the pilot unit with one warning: reach `5789842`'s stage is
not monotonic with profile index. That is real — it steps backwards by 0.04 ft —
and it is a property of the ras2fim run, which writes its own
`warning_stage_diff_gt_1ft_<huc8>.csv`. Do not silence it.

Then preview it. A pipeline that passes validation can still render nothing, and
the depth grid is the whole product:

```powershell
python serve/range_server.py 8100 src/viewer-1d
python serve/dev_tiles.py --port 8102 --root src/viewer-1d
```

## Scope

This repository publishes what ras2fim produced. It does not filter, smooth,
reinterpret, or re-derive hydraulics. Wide inundation in flat terrain is a real
characteristic of 1D RASMapper mapping, not a defect to correct here — if it
needs addressing, it is addressed in the model or in `ras2fim`, upstream.

Git: this tree is under `H:\CLB-Repos`, so use `clbgit` for working-tree
operations, and native `git` only for GitHub sync. See the shared workspace
`CLAUDE.md`.
