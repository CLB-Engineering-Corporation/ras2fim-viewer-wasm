# Building a release from a ras2fim unit

Part of [ras2fim-viewer-wasm](../README.md).

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
