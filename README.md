# ras2fim-viewer-wasm

Interactive MapLibre webmaps for [ras2fim](https://github.com/NOAA-OWP/ras2fim)
flood inundation output — HEC-RAS **model extents**, **model geometry**, and the
**depth-grid library** — with a slider that steps through the library and
reports each conflated NWM reach's hydraulics.

There are two paths here, because the 1D and 2D outputs are shaped differently.

**Browser-native (`src/netcdf-viewer/`)** — the direction the name points at.
[ras2fim-2d](https://github.com/andycarter-pe/ras2fim-2d) writes NetCDF4, which
is HDF5, already in EPSG:3857, with WSEL and terrain packed as `uint16`. So
[h5wasm](https://github.com/usnistgov/h5wasm) reads it **directly in the
browser**: no tile server, no conversion step, and depth is an integer subtract.
Measured at 2.35 MB downloaded, 148 ms to decode 15 flow layers, 25–42 ms per
slider step with zero network I/O.

**Server-assisted (`src/frontend/`, `pipeline/`)** — the working 1D dashboard.
ras2fim 1D emits dozens of separate GeoTIFFs in State Plane feet, which a
browser cannot use as they are, so this path warps them to COGs and serves them
through TiTiler. Fully built and validated.

The pilot 1D unit is `12090301_2277_ble_260901` — Alum Creek–Colorado River,
Texas; 20 models cataloged, 1 (`ALUM 026`) with a published 72-profile library.

**Live demo:** <https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/>
— the browser-native viewer on GitHub Pages, reading NetCDF with no server
behind it. Built by `pipeline/build_netcdf_site.py`, deployed from `gh-pages`.

> **Status:** the 1D path is complete and validated but has not been deployed.
> The 2D path is a proven prototype, not a product.

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
`validate_release.py` reports this as a warning rather than a failure, because
it is a property of the model, not of the publication.

## Rendering contract

Inherited from `clb_lwi_webmap` — `pipeline/cog_postprocess.py` is vendored from
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
src/frontend/            no-build web application
  index.html  app.js  styles.css
  config.js              per-deployment settings (TiTiler base URL)
  manifest.json          generated browser catalog
  pmtiles/               generated vector archives  (not committed)
  cogs/                  generated depth COGs       (not committed)
  vendor/                pinned MapLibre + PMTiles + glyphs
pipeline/
  ras2fim_source.py      reads a ras2fim output unit; the only module that
                         knows that directory's shape
  cog_postprocess.py     vendored raster contract; every COG write goes through
                         finish_cog()
  build_fim_cogs.py      depth grids -> COGs
  build_fim_pmtiles.py   geometry + conflation layers -> one PMTiles per unit
  build_manifest.py      assembles manifest.json, embeds the rating curves
  validate_release.py    does everything the manifest advertises resolve?
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
python pipeline/ras2fim_source.py $unit

python pipeline/build_fim_cogs.py    $unit --out src/frontend/cogs
python pipeline/build_fim_pmtiles.py $unit --out src/frontend/pmtiles
python pipeline/build_manifest.py    $unit --frontend src/frontend
python pipeline/validate_release.py --frontend src/frontend --deep
```

`build_fim_cogs.py` skips COGs that already exist; pass `--force` to rebuild.
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

Vendored under `src/frontend/vendor/`, unmodified:

| Component | Version | License |
|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 5.24.0 | BSD-3-Clause |
| [PMTiles](https://github.com/protomaps/PMTiles) | 4.5.0 | BSD-3-Clause |
| Open Sans glyph ranges | — | SIL Open Font License 1.1 |

The NetCDF prototype additionally uses
[h5wasm](https://github.com/usnistgov/h5wasm) 0.10.3, fetched by
`src/netcdf-viewer/fetch-vendor.sh` rather than committed.

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
