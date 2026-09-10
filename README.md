# ras2fim-viewer-wasm

Interactive MapLibre webmaps for [ras2fim](https://github.com/NOAA-OWP/ras2fim)
flood inundation output — HEC-RAS **model extents**, **model geometry**, and the
**depth-grid library** — with a slider that steps through the library and
reports each conflated NWM reach's hydraulics.

There are two paths here, because the 1D and 2D outputs are shaped differently.

**Browser-native (`src/viewer-2d/`)** — the direction the name points at.
[ras2fim-2d](https://github.com/andycarter-pe/ras2fim-2d) writes NetCDF4, which
is HDF5, already in EPSG:3857, with WSEL and terrain packed as `uint16`. So
[h5wasm](https://github.com/usnistgov/h5wasm) reads it **directly in the
browser**: no tile server, no conversion step, and depth is an integer subtract.

Measured in Chrome on `wb-2427466` (1963 × 1331, 15 flow layers, 2.35 MB):

| | |
|---|---|
| Download | 34 ms |
| Decode 15 layers | 168 ms — in a worker, so the page never blocks |
| Prepare 15 layers | 213 ms, once |
| Paint one layer | **0.8 ms** (dense equivalent: 13.0 ms — 16.3×) |
| Held on the main thread | **20.2 MB** of sparse index, not 83.6 MB of dense arrays |

The slider does no network I/O and no per-step scanning: every layer is prepared
once, and stepping paints only the ~12% of cells that are wet.

**Server-assisted (`src/viewer-1d/`, `pipeline/`)** — the working 1D dashboard.
ras2fim 1D emits dozens of separate GeoTIFFs in State Plane feet, which a
browser cannot use as they are, so this path warps them to COGs and serves them
through TiTiler. Fully built and validated.

The pilot 1D unit is `12090301_2277_ble_260901` — Alum Creek–Colorado River,
Texas; 20 models cataloged, 1 (`ALUM 026`) with a published 72-profile library.

**Live demo:** <https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/>
— the browser-native viewer on GitHub Pages, reading NetCDF with no server
behind it. Built by `pipeline/fim2d/site.py`, deployed from `gh-pages`.

> **Status:** the 1D path is complete and validated but has not been deployed.
> The 2D path is built, validated and live. Both have validators
> (`pipeline/fim1d/validate.py`, `pipeline/fim2d/validate.py`) that
> gate the failures that are otherwise silent in a browser.

## What it shows

| Layer | Source | Notes |
|---|---|---|
| Depth grid | `05_hecras_output/<model>/<model>/Depth (flow<N>_ft)*.tif` | One COG per profile, served by TiTiler |
| Model extents | derived from cross sections + centerlines | Blue = has a depth library; gray = geometry only |
| ras2fim model domain | `final/models_domain/models_domain.gpkg` | The domain ras2fim actually conflated |
| Cross sections, centerlines | `01_shapes_from_hecras/` | 283 cross sections across 20 models |
| NWM flowlines, snap points | `02_csv_shapes_from_conflation/` | How RAS geometry was tied to the NWM network |
| HUC12 boundaries | `02_csv_shapes_from_conflation/*_huc_12_ar.shp` | The DEM clip domain |
| Maximum extent outline | `Inundation Boundary (flow<N>_ft Value_0).shp` | Written by ras2fim at the top profile only |

## The profile index is the join key

ras2fim's second hydraulic pass lays profiles out at a **uniform depth interval
at the model's controlling cross section** — the one with maximum depth in the
first pass. Profile `N` is the zero-based RASMapper `ProfileIndex`, and it is
the same `profile_num` that appears in the rating curves and the geocurves. That
is why the map has one slider and one readout per reach: the profile is shared,
the hydraulics are not.

A consequence worth knowing before reading the numbers: because the spacing is
uniform at the *controlling* section, every other section — and so every
conflated reach — sees its own uneven stage steps. On the pilot unit, reach
`5789842` even steps **backwards** by 0.04 ft between two profiles.
`fim1d/validate.py` reports this as a warning rather than a failure, because
it is a property of the model, not of the publication.

## Rendering contract

Inherited from `clb_lwi_webmap` — `pipeline/fim1d/cog_postprocess.py` is vendored from
it, and the two should stay in step. The reasoning lives in that file; the short
version:

- A depth grid is a **wet/dry surface**, not a plain continuous raster: the
  value carries an implicit inundation mask in its nodata. GDAL's `AVERAGE`
  overviews inflate published wet area at every level and `NEAREST` reports
  progressively wrong values, so every COG gets **area-matched coverage-mask
  overviews** that reproduce the parent level's wet area and carry the mean of
  the wet contributors only.
- `LERC_DEFLATE` at `MAX_Z_ERROR=0.01 ft` — a bounded-error codec held below the
  meaningful precision of a HEC-RAS depth result. The tolerance is stamped into
  every COG as `FIM_MAX_Z_ERROR`, because the tolerance is what makes it
  defensible. The pilot library compresses 19 MB of source grids to **4.3 MB**.
- The warp to EPSG:4326 is **nearest-neighbour**. Bilinear at the wet edge
  averages against nodata and fabricates depths no profile produced. Measured on
  the pilot: wet area 5.6332 km² → 5.6300 km² (0.06%), peak depth 31.84 ft
  unchanged.
- **No shallow-depth filter by default.** ras2fim writes its grids with
  `ArrivalDepth=0`, so every wet cell is mapped; filtering here would publish a
  narrower extent than ras2fim produced. `--min-depth` is available and is
  stamped into the affected COGs when used.
- The colour ramp is fixed at `0 … depth_max_ft` **for the whole library**, not
  per profile. Restretching each profile would render every one with the same
  darkest blue and hide exactly what the slider exists to show.

## Repository layout

```text
src/viewer-1d/            no-build web application
  index.html  app.js  styles.css
  config.js              per-deployment settings (TiTiler base URL)
  manifest.json          generated browser catalog
  pmtiles/               generated vector archives  (not committed)
  cogs/                  generated depth COGs       (not committed)
  vendor/                pinned MapLibre + PMTiles + glyphs
pipeline/
  fim1d/source.py      reads a ras2fim output unit; the only module that
                         knows that directory's shape
  cog_postprocess.py     vendored raster contract; every COG write goes through
                         finish_cog()
  fim1d/cogs.py      depth grids -> COGs
  fim1d/pmtiles.py   geometry + conflation layers -> one PMTiles per unit
  fim1d/manifest.py      assembles manifest.json, embeds the rating curves
  fim1d/validate.py    does everything the manifest advertises resolve?
serve/
  preview.py             starts both preview servers on one host
  range_server.py        static server with PMTiles byte-range support
  dev_tiles.py           local TiTiler stand-in, for preview only
```

## Build a unit

The pipeline needs the **GDAL Python bindings**, not rasterio: the area-matched
overview builder writes overview levels directly, which only the `osgeo` API
exposes. On CLB workstations that is the `lwi-gdal` conda environment.

```powershell
conda activate lwi-gdal

$unit = "C:\ras2fim_data\output_ras2fim\12090301_2277_ble_260901"

# What did this unit publish?
python -m pipeline.fim1d.source $unit

python -m pipeline.fim1d.cogs    $unit --out src/viewer-1d/cogs
python -m pipeline.fim1d.pmtiles $unit --out src/viewer-1d/pmtiles

# Optional, and what makes the dashboard publishable to static hosting:
# bake each profile's depth grid into its own PMTiles archive.
python -m pipeline.fim1d.depth_pmtiles src/viewer-1d --depth-max 31.836

python -m pipeline.fim1d.manifest    $unit --out src/viewer-1d
python -m pipeline.fim1d.validate src/viewer-1d --deep
```

Order matters in one place: `depth_pmtiles` reads the built COGs, and
`manifest` records the archives it finds, so it runs last.

## Two ways to deliver depth

The 1D dashboard draws depth as a raster tile layer, and the **manifest**
decides where those tiles come from. This is a property of the release that was
built, not of the machine viewing it.

| | Tiled on demand | Baked |
|---|---|---|
| Needs | TiTiler reading the COGs | nothing but a static file server |
| Payload | 4.3 MB of COGs | 4.8 MB of PMTiles |
| Right for | a deployment carrying many units | publication, demos, air-gapped review |
| Ramp | applied per request | baked into the pixels |

Both render the same pixels: the colour ramp and the library-wide rescale come
from `pipeline/common/ramp.py`, which the tile server and the baker share.

A profile carrying `depth_pmtiles` uses the archive; one without it falls back
to `rasterTileBase`. A release where every profile is baked needs no tile
service at all, and `pipeline.fim1d.site` refuses to publish one that is not:

```powershell
python -m pipeline.fim1d.site src/viewer-1d --out site-1d/
python -m pipeline.fim1d.validate site-1d/ --deep    # no GDAL needed
```

The published release deliberately omits the COGs. They are the source the
tiles were baked from; without a tile service no browser can read them, so the
manifest stops naming them too.

`fim1d/cogs.py` skips COGs that already exist; pass `--force` to rebuild.
`--limit N` builds only the first N profiles, which is the right way to smoke
test a new unit.

## Preview locally

The map needs two servers — static files with byte-range support for PMTiles,
and a tile server for the depth COGs. `serve/preview.py` starts both:

```powershell
python serve/preview.py
```

Then open <http://127.0.0.1:8100/>. Arrow keys step the profile; space plays and
pauses the library.

`serve/dev_tiles.py` implements only the three TiTiler endpoints the frontend
calls, with the same paths and query parameters, so the production URL contract
is exercised in development. It is **not** a TiTiler replacement — single
process, no caching, local filesystem only.

### Previewing from another device

`127.0.0.1` is the viewer's own loopback, so it can never reach the machine
running the servers. Bind to that machine's own address instead:

```powershell
python serve/preview.py --host 10.0.0.42         # this machine's own LAN address
```

`--host` takes one specific address and refuses `0.0.0.0`: what becomes
reachable should be a deliberate choice, not every interface the box has. Both
servers are read-only and unauthenticated — stop them when you are done.

`config.js` derives the tile base from `location.hostname`, so the depth grid
follows the address the page was served from. Hardcoding it is the trap here: a
literal `127.0.0.1:8102` leaves a remote viewer with every vector layer drawn
and no depth grid, which looks like missing data rather than a bad URL.

## Deployment

`config.js` is the only file that differs between environments. In production
`rasterTileBase` points at a **same-origin** nginx path proxied to TiTiler — no
CORS, no mixed content — following `clb_lwi_webmap`'s `/lwi-tiles/*`. See
`deploy.example.json`.

Build COGs and PMTiles on a trusted internal worker. The public web host
should serve released artifacts only -- never run extraction or raster
generation there.

## Provenance

- Frontend shell, sidebar behaviour, and manifest-driven catalog pattern from
  [`clb-ebfe-webmap`](../clb-ebfe-webmap).
- Raster publication contract from
  [`clb_lwi_webmap`](../clb_lwi_webmap) — see its
  `WEBMAP_BEST_PRACTICES_FROM_RBFS_2026-08-24.md` and
  `docs/RBFS_AUDIT_ADOPTION.md` before changing anything about raster
  publication.
- Source data from [`ras2fim`](../ras2fim), CLB's Linux fork of
  [NOAA-OWP/ras2fim](https://github.com/NOAA-OWP/ras2fim).

## Third-party components

Vendored under `src/viewer-1d/vendor/`, unmodified:

| Component | Version | License |
|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 5.24.0 | BSD-3-Clause |
| [PMTiles](https://github.com/protomaps/PMTiles) | 4.5.0 | BSD-3-Clause |
| Open Sans glyph ranges | — | SIL Open Font License 1.1 |

The NetCDF prototype additionally uses
[h5wasm](https://github.com/usnistgov/h5wasm) 0.10.3, fetched by
`src/viewer-2d/fetch-vendor.sh` rather than committed.

## Why a webmap rather than an existing FIM viewer

There is no reusable open-source FIM viewer to adopt. The NOAA-OWP ecosystem
publishes production and evaluation code, not visualization:
[`inundation-mapping`](https://github.com/NOAA-OWP/inundation-mapping),
[`ripple1d`](https://github.com/Dewberry/ripple1d),
[`ripple1d-pipeline`](https://github.com/NOAA-OWP/ripple1d-pipeline),
[`flows2fim`](https://github.com/NOAA-OWP/flows2fim) (emits VRT and says "view
in QGIS"; no viewer component), and
[`gval`](https://github.com/NOAA-OWP/gval) (agreement maps and metrics, plotted
in notebooks). The government-facing viewers —
[USGS Flood Inundation Mapper](https://apps.usgs.gov/fim/), whose gage-height
slider is the closest published analogue to this map's profile slider, and the
[NOAA National Water Prediction Service viewer](https://viewer.weather.noaa.gov/water)
over [HydroVIS](https://maps.water.noaa.gov/server/rest/services) — are closed.
CLB already had the better starting point in-house.
