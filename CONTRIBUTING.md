# Contributing

## Before you change anything

```sh
node --test tests/*.test.mjs              # the browser reader, no dependencies
python -m unittest discover -s tests -t . # the pipeline, needs numpy + netCDF4
python -m pipeline.check_conventions      # the rules in .conventions.yaml
```

All three run in about a second and none needs a browser, a tile server, GDAL,
or the network. CI runs exactly these.

## The two environments are not an accident

Half of `pipeline/` requires the GDAL Python bindings and half must not run
there. The area-matched overview builder writes overview levels directly, and
only the `osgeo` API exposes that — rasterio has no equivalent, so "simplify
this to one environment" is not a simplification, it is a rewrite of the module
that exists for that reason.

| | Interpreter |
|---|---|
| `pipeline/fim1d/*` (except `validate.py`) | a GDAL 3.8+ environment; on CLB workstations, conda `lwi-gdal` |
| `pipeline/fim2d/*`, `pipeline/common/*`, `serve/*`, `pipeline/fim1d/validate.py` | the plain interpreter |

`pipeline/check_conventions.py` enforces that split by parsing imports, so
adding `from osgeo import gdal` to the wrong half fails rather than surprising
someone later.

The GDAL on `PATH` at `C:\Program Files\GDAL` on CLB workstations is 2.1.0
(2016) and predates the COG driver entirely. Never invoke it.

## Conventions

`.conventions.yaml` carries every rule with its reasoning and its documented
exceptions. Read it before adding a tool or renaming a flag. Rules marked
`enforced: true` are checked by `pipeline/check_conventions.py`; the rest are
there so a reviewer can cite them.

If you add a rule, add its check. The checker warns about any rule declaring
itself enforced that nothing verifies, so the gap is visible rather than silent.

## Tests

Put a test in the suite matching what it needs, and name it for the failure it
catches rather than the function it calls. Several tests exist because a
specific bug shipped once, and the comment saying which one is the useful part.

Two properties are load-bearing and worth protecting deliberately:

- **`src/viewer-2d/netcdf.js` stays DOM-free.** It is loaded unmodified in Node
  through `node:vm`, which is what lets the sparse-vs-dense paint oracle run in
  milliseconds instead of requiring someone to open a browser. If that test ever
  needs a browser or an `npm install`, the reader has grown a dependency it
  should not have.
- **`tests/fixtures/geodesy_cases.json` is a two-language contract.** The same
  Web Mercator and `GeoTransform` rules exist in Python and in JavaScript
  because the browser cannot import Python. Change one and the other fails.
  Regenerate deliberately with `python -m tests.regenerate_geodesy_fixture`.

Fixtures are synthesised into temporary directories, never committed. A depth
library is far too large for Git history.

## Feature development notes

`feature_dev_notes/` holds dated records: what was measured, what was decided,
and what would make the decision wrong. They are **records, not documentation**.
Correct one by appending, not by rewriting it — a note that says "we rejected X
because we measured Y" is worth more than the absence of X in the source.

## Testing in an automated browser

An agent-driven Chrome tab reports `document.hidden === true`, so Chrome never
fires `requestAnimationFrame`, MapLibre's render loop never runs, and it never
requests a tile. The panel, the manifest fetch and the readouts all keep
working, so it presents as "the numbers move and the map does not" — which reads
exactly like a broken raster layer.

The tell: `curl` gets a 200 from the tile URL while the browser's own network
log has no tile request in it. A real drag on the canvas forces a render.

The same applies to the 2D viewer's worker: one created after page load is never
scheduled in a hidden tab. Both are testing constraints, not product defects,
and each has cost an afternoon.

## Scope

This repository publishes what ras2fim produced. It does not filter, smooth,
reinterpret, or re-derive hydraulics. Wide inundation in flat terrain is a real
characteristic of 1D RASMapper mapping, not a defect to correct here. If it
needs addressing, it is addressed in the model or in `ras2fim`, upstream.

## Git

This tree is developed on a NAS share where working-tree Git runs through
`clbgit`; native `git` is used only for GitHub sync. That is a CLB workstation
detail and not a requirement for contributing from a normal clone.

Generated artifacts — COGs, PMTiles, NetCDF, vendored viewer libraries and
`deploy.json` — stay out of Git on `main`. `gh-pages` is the exception; it is
generated output by definition and is replaced wholesale on each deploy.
