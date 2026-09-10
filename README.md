# ras2fim-viewer-wasm — live demos

Generated from the `main` branch by `pipeline/fim2d/site.py` and
`pipeline/fim1d/site.py`. Do not edit here; this branch is replaced wholesale on
each deploy.

| | |
|---|---|
| [**/**](https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/) | ras2fim-2d, read from NetCDF in the browser |
| [**/1d/**](https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/1d/) | ras2fim 1D depth-grid library, model extents and rating curves |

Neither page has a tile server behind it.

The 2D viewer opens the `.nc` files under `data/` with h5wasm in a Web Worker.
They are byte-for-byte as ras2fim-2d wrote them, with no conversion step.
`?verify=1` runs the retained dense renderer alongside the sparse one and
asserts they agree byte for byte.

The 1D dashboard draws its depth grids from per-profile PMTiles archives baked
from the published COGs — 72 profiles in 4.8 MB, because a flood is a thin
corridor inside a much larger model bounding box and every transparent tile is
skipped. The stage slider steps the raster and the rating-curve readouts
together.

## Data provenance

**2D** — [andycarter-pe/ras2fim-2d](https://github.com/andycarter-pe/ras2fim-2d)
`sample_output`, BSD-3-Clause, © 2026 The University of Texas at Austin.

**1D** — ras2fim v2.0.3.1 output for HUC8 12090301 (Alum Creek–Colorado River,
Texas), derived from FEMA Base Level Engineering models. Published by CLB
Engineering Corporation as a worked example. It is a demonstration of the
viewer, not a regulatory product: it shows what ras2fim produced, unfiltered
and unsmoothed.
