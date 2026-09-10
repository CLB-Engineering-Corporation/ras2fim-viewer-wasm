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

**Static-tiled (`src/viewer-1d/`, `pipeline/fim1d/`)** — the 1D dashboard.
ras2fim 1D emits dozens of separate GeoTIFFs in State Plane feet, which a
browser cannot use as they are, so this path warps them to COGs. Those can be
tiled on demand by TiTiler, or baked once into per-profile PMTiles archives —
72 profiles in 4.8 MB — which needs no tile service at all. See
[docs/building.md](docs/building.md).

The pilot 1D unit is `12090301_2277_ble_260901` — Alum Creek–Colorado River,
Texas; 20 models catalogued, 1 (`ALUM 026`) with a published 72-profile library.

## Live demos

| | |
|---|---|
| [**2D viewer**](https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/) | ras2fim-2d NetCDF read in the browser with h5wasm |
| [**1D dashboard**](https://clb-engineering-corporation.github.io/ras2fim-viewer-wasm/1d/) | ras2fim 1D depth library, model extents and rating curves |

Neither has a tile server behind it. Both are built from `main` by
`pipeline/fim2d/site.py` and `pipeline/fim1d/site.py` and deployed from
`gh-pages`.

> **Status:** both paths are built, validated and live. Each has a validator
> that gates the failures which are otherwise silent in a browser, and a
> conventions checker guards the rules those validators rest on.

## Documentation

| | |
|---|---|
| [docs/building.md](docs/building.md) | building a release from a ras2fim unit, and the two ways to deliver depth |
| [docs/rendering-contract.md](docs/rendering-contract.md) | what the map draws, and the join key everything hangs off |
| [docs/deployment.md](docs/deployment.md) | publishing a release |
| [docs/provenance.md](docs/provenance.md) | where the data and the vendored code came from |
| [docs/comparison.md](docs/comparison.md) | why a webmap rather than an existing FIM viewer |
| [tests/README.md](tests/README.md) | the test suite, and why it is split the way it is |
| [CONTRIBUTING.md](CONTRIBUTING.md) | how to work on this |
| [.conventions.yaml](.conventions.yaml) | the rules, the reasoning, and which are machine-checked |

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

## Repository layout

```text
src/
  viewer-1d/             1D dashboard: COG or baked-PMTiles depth, no build step
  viewer-2d/             2D viewer: NetCDF read in the browser with h5wasm
pipeline/
  common/                geodesy.py, ramp.py -- what both products genuinely share
  fim1d/                 source.py cogs.py pmtiles.py depth_pmtiles.py
                         manifest.py site.py validate.py cog_postprocess.py
  fim2d/                 manifest.py site.py validate.py
  check_conventions.py   enforces the mechanical subset of .conventions.yaml
serve/
  preview.py             starts what a viewer needs, on one host
  range_server.py        static server with the byte-range support PMTiles needs
  dev_tiles.py           local TiTiler stand-in, for preview only
tests/                   node --test for the reader, unittest for the pipeline
docs/                    the longer documents this README links to
feature_dev_notes/       dated records of what was measured and decided
```

Every tool runs as a module — `python -m pipeline.fim1d.site` — which is what
lets `serve/` share the colour ramp with the pipeline instead of copying it.

The 1D half needs the GDAL Python bindings; the 2D half deliberately does not,
and neither does `pipeline/fim1d/validate.py`, so a published release can be
validated on the host that will serve it. See `pyproject.toml` for the groups.
