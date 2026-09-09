# Prototype — reading ras2fim-2d NetCDF in the browser

**Question:** can a webmap read ras2fim-2d's native `.nc` output directly, with
no tile server and no COG conversion step?

**Answer: yes, and it is faster than the 1D path it would replace.**

Vendor libraries and sample data are pinned, not committed -- populate them
first:

```bash
bash prototypes/netcdf-2d/fetch-vendor.sh
cp <ras2fim-2d>/sample_output/06_simple_rasters/03_wsel_nc_filtered/*.nc    prototypes/netcdf-2d/data/
python pipeline/build_netcdf_manifest.py prototypes/netcdf-2d/data    --out prototypes/netcdf-2d/manifest.json
```

The viewer's stream list comes from that manifest, so the same page serves any
directory of ras2fim-2d output. To build a standalone, deployable copy instead
-- viewer, libraries, data, and manifest in one folder ready for any static
host -- use `pipeline/build_netcdf_site.py`.

Run it:

```powershell
python serve/range_server.py 8110 prototypes/netcdf-2d
```

then open <http://127.0.0.1:8110/>. To reach it from another device, pass this
machine's own address as a third argument -- one specific interface, never
`0.0.0.0`:

```powershell
python serve/range_server.py 8110 prototypes/netcdf-2d 10.0.0.42
```

Every path in the page is relative, so nothing needs reconfiguring for a
different host. That is a side effect of there being no tile service: the 1D
dashboard has to derive its `rasterTileBase` from `location.hostname`, and this
has no second origin to point at.

Nothing else runs — no TiTiler, no
`dev_tiles.py`, no build step. The page fetches the `.nc`, decodes it, and
renders depth.

## Measured, in Chrome

Against `filter_wsel_wb-2427466.nc` — 1963 × 1331 at 3 m, 15 flow layers:

| | |
|---|---|
| Download | **9 ms** (2.35 MB, localhost) |
| h5wasm init | **5 ms** |
| Decode all 15 layers | **148 ms** |
| Paint one layer | **15 ms** |
| Slider step, end to end | **25–42 ms** |
| Memory | 83.6 MB uint16 arrays, 115 MB JS heap |

And the small stream `wb-2427467` (179 × 103, 18 flows): 0.07 MB, decode 3 ms,
paint 0.6 ms.

The slider does **no network I/O** — every flow is already in memory. That is
strictly better than the 1D dashboard, where each profile change is a round trip
for new tiles.

## Why it works

Three properties of the ras2fim-2d output do all the work:

1. **NetCDF4 is HDF5.** `h5wasm` opens it in the browser with no conversion.
2. **The grid is already EPSG:3857**, north-up, 3 m. Its four corners land on
   MapLibre's own projection exactly, so it goes straight into a `canvas` source
   with nothing to reproject and nothing to tile.
3. **Depth is an integer subtract.** `wsel` and `terrain` are both `uint16` with
   `scale_factor 0.1` and `_FillValue 65535`, so
   `depth_ft = (wsel_raw - terrain_raw) * 0.1` — one pass over a `Uint16Array`,
   which is why a 2.6-megapixel layer paints in 15 ms.

h5wasm returns **raw** values: `scale_factor`, `_FillValue`, and the coordinate
variables are CF/netCDF conventions layered on HDF5, not HDF5 itself. `netcdf.js`
applies them. That is a feature here — staying in raw integers is what keeps the
inner loop cheap.

## Things worth knowing before building on this

- **The library is bigger than the data.** `vendor/h5wasm.js` is 5.7 MB (wasm
  embedded, self-contained) against a 2.35 MB data file. It caches after first
  load, but it dominates cold start. A kerchunk + zarr.js reader would be smaller
  on the wire and would do HTTP range reads instead of whole-file fetches; it
  costs a generated sidecar per `.nc`. At these file sizes h5wasm is the simpler
  trade.
- **Memory scales with the whole file.** 83.6 MB held for one stream. Fine for
  one stream at a time; decoding on demand (≈40 ms per layer) is the fallback if
  several streams need to be open at once.
- **`GeoTransform`, not the x/y vectors.** The `x`/`y` coordinates are cell
  *centres*; using them as an extent shifts the raster half a cell. `netcdf.js`
  reads `spatial_ref.GeoTransform` instead.
- **Chunking is `[8, 666, 982]`** — one flow costs 8× waste to inflate. Irrelevant
  when the whole file is fetched, but it would matter for any range-read design.
  `[1, 512, 512]` upstream would fix it, but that is a change to someone else's
  pipeline, not something to assume.

## Open data question

Depth goes **negative** — wsel below terrain:

| Stream | Flow | Below-terrain cells | Min depth |
|---|---|---|---|
| wb-2427466 | 11,609 cfs | 1,520 | −2.60 ft |
| wb-2427466 | 1,542 cfs | 2,514 | −2.60 ft |
| wb-2427467 | top | 23 | −0.90 ft |

It gets *worse at lower flow*. The prototype renders these as dry (transparent)
and counts them in the panel rather than hiding them. Whether that is the right
treatment is a question for upstream — it may be interpolation noise between
the WSEL surface and the terrain, or it may be signal.

## Files

```text
index.html   panel + map
netcdf.js    the reader: HDF5 -> depth. No MapLibre, no DOM.
app.js       wiring, rendering, timings
vendor/      h5wasm 0.10.3 (iife), MapLibre 5.24.0  (not committed)
data/        two sample streams from ras2fim-2d/sample_data  (not committed)
```

`netcdf.js` is deliberately independent of the map — it is the piece that would
move into a real viewer.
