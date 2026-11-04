# Publishing the 1D dashboard without a tile server

**Date:** 2026-09-11
**Status:** shipped and live at `/1d/`

---

## The problem

The 1D dashboard drew depth only through TiTiler. That is the right answer for a
private deployment carrying many units — one service, no pre-rendering, any
ramp on demand — and it made the dashboard impossible to publish anywhere this
repository's own argument applies. GitHub Pages cannot run a tile service, and
the whole thesis here is that a browser can read flood-inundation results with
no raster machinery behind it.

## What the measurement changed

The design was chosen after measuring, not before. Four options were on the
table; one number eliminated three of them.

**The whole 72-profile depth library is 4.3 MB of COGs.** LERC_DEFLATE at a
0.01 ft tolerance is very good at this data. That immediately ruled out anything
justified by size.

| Option | Verdict |
|---|---|
| Read the COGs in the browser with geotiff.js | On-thesis and 4.3 MB, but a new vendored decoder, a LERC dependency, and a rewrite of the layer from raster tiles to a canvas source — a 6.5 M-cell texture upload per step, three times the 2D viewer's. Deferred, not rejected. |
| Convert the library to one NetCDF stack and reuse the 2D viewer | 1788 × 3639 × 72 × 2 bytes is **937 MB** decoded. The 2D viewer holds the stack in memory. Dead on arrival. |
| Pre-rendered XYZ tiles in a directory | Works, but tens of thousands of small files on `gh-pages`. |
| **Baked PMTiles, one archive per profile** | Chosen. |

Then the second measurement made it easy. At profile 60 the wet area is
**3.2 × 2.9 km inside a 15 × 35 km grid — 0.9% of the cells.** A flood is a thin
corridor inside a model bounding box, so almost every tile is fully transparent
and GDAL skips it.

| | |
|---|---|
| Tiles at zoom 14, profile 60 | 6 |
| Tiles in the whole pyramid, zoom 9–14 | 13 |
| One archive | 110–130 KB |
| **All 72 profiles** | **4.8 MB** |
| Build time | about 2 minutes |

4.8 MB of tiles against 4.3 MB of COGs. The baked path costs 12% more bytes and
removes a service.

## What was nearly got wrong

**The pyramid looked broken and was not.** Six tiles at zoom 14 for a
15 × 35 km footprint is wrong by arithmetic — about 112 tiles should cover that
box. Two hypotheses were tested before the right one: that `gdal.Translate`
had not flushed before the file was reopened for overviews, and that the base
zoom was too low. Neither was true. Measuring the alpha channel directly showed
0.9% of cells wet, and six tiles is exactly right.

The flush bug is real anyway and is guarded in the builder: the dataset
`gdal.Translate` returns **must** be released before the file is reopened, or
you get a pyramid with a handful of tiles and no error.

**The PMTiles header offsets were wrong from memory.** The tile type is byte 99,
not 17. Byte 17 is inside the metadata offset, and a check against it passes on
almost anything. They were read off a real archive before being written down.

## The three decisions worth keeping

**The manifest decides how depth arrives, not `config.js`.** A profile carrying
`depth_pmtiles` draws from its archive; one without falls back to
`rasterTileBase`. Putting this in per-deployment config would make a release
behave differently depending on who opened it.

**A published release carries no COGs.** Without a tile service they are 4.3 MB
no browser can read, so the manifest stops naming them. A manifest that points
at files a release does not carry is a broken contract, not a harmless leftover.

**`fim1d/site.py` refuses to publish a release that still needs TiTiler.** That
failure is silent in the worst way: the page loads, the panel fills in with
correct hydraulics, and the depth grid never appears. `--allow-tile-service`
exists for a target that really does run one.

## One ramp

`serve/dev_tiles.py` applies the colour ramp per request; `depth_pmtiles.py`
bakes it into pixels. They now share `pipeline/common/ramp.py`, because if they
drift a preview and a publication of the same data show different depths. The
rescale rule travels with it: scale to the **library** maximum, never the
profile's own, or every profile renders with the same darkest blue and the
slider stops showing the flood rising.

`serve/` became a package so it could import that module — which is also why the
preview servers now run as `python -m serve.dev_tiles`.

## Deferred

- **geotiff.js in the browser.** Still the most on-thesis answer, and it would
  drop the payload to 4.3 MB with no pre-render step. It waits on a reason
  better than elegance: the baked path is already small enough and needs no new
  decoder.
- **Overzoom past zoom 14.** The archives stop at their native resolution, so
  MapLibre stretches beyond it. The cells really are about 8 m, so the blockiness
  is honest — TiTiler with `resampling=nearest` looks the same.
- **A second unit.** Everything here is one model of the twenty catalogued in
  the pilot unit.
