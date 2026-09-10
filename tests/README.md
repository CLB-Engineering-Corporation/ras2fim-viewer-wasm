# Tests

```sh
node --test tests/*.test.mjs             # the browser reader, no dependencies
python -m unittest discover -s tests -t .   # the pipeline, needs numpy + netCDF4
```

Both run in well under a second. Neither needs a browser, a tile server, GDAL,
any committed data, or the network -- the round-trip test builds against a
temporary viewer root with stub vendor files, so it never triggers
`fetch-vendor.sh`.

## Why the suite is split

The repository spans two environments on purpose, and the tests follow that
split rather than papering over it.

| Suite | Runner | Needs | Covers |
|---|---|---|---|
| `netcdf-reader.test.mjs` | `node --test` | nothing | the browser reader: sparse-vs-dense oracle, clearing, packing, the two "wet" populations, bbox, ramp packing |
| `test_geodesy.py` | `unittest` | nothing | `pipeline/common/geodesy.py`, and its agreement with the JavaScript copy |
| `test_site_safety.py` | `unittest` | `netCDF4` | the destructive-`--clean` refusals and the `VIEWER_FILES` contract |
| `test_roundtrip.py` | `unittest` | `netCDF4`, `numpy` | build a site from synthesised NetCDF, then deep-validate it |

The 1D pipeline is **not** covered here. It needs the GDAL Python bindings and
real ras2fim output, neither of which belongs in a two-minute CI job. Its gate
stays manual:

```sh
conda activate lwi-gdal
python -m pipeline.fim1d.validate src/viewer-1d --deep
```

## The property that makes this cheap

`src/viewer-2d/netcdf.js` is DOM-free and scoped to `self`, and every function
downstream of `readStack()` takes a plain object. So the reader loads in Node
through `node:vm` with `self` bound the way a worker binds it -- unmodified, no
build step, no module shim in the shipped source -- and the oracle that gates
the 16x paint optimisation runs in milliseconds instead of requiring someone to
open a browser with `?verify=1`.

If `netcdf-reader.test.mjs` ever needs a browser or an `npm install`, the reader
has grown a dependency it should not have. That is the signal, not an
inconvenience to work around.

## The cross-language fixture

`pipeline/common/geodesy.py` and `src/viewer-2d/netcdf.js` implement the same
Web Mercator and `GeoTransform` rules in two languages, because the browser
cannot import Python. `fixtures/geodesy_cases.json` is read by both suites, so a
change made to one side and not the other fails a test instead of drifting.

It has already earned its place: the JavaScript used `parts.some(isNaN)`, and
`isNaN(Infinity)` is `false`, so it accepted an infinite origin that Python
rejected. Writing the fixture is what surfaced it.

Regenerate it only when the contract itself changes, and re-run both suites:

```sh
python -m tests.regenerate_geodesy_fixture
```

The Node glob is unquoted so the shell expands it. Node only learned to expand
`--test` patterns itself after version 20, and a quoted pattern fails there
rather than silently running nothing.

## Fixtures are synthesised, not committed

`fixture_nc.py` writes a few-kilobyte ras2fim-2d NetCDF into a temporary
directory. It does not imitate the hydraulics; it carries exactly the structure
the reader and manifest builder depend on -- packed `uint16` with
`scale_factor`, a `_FillValue`, a `spatial_ref` GeoTransform, and the `00_`/`01_`
global attributes -- plus the cases that were once wrong: a depth-variable stack,
a rotated grid, non-integer flows, a below-terrain cell, and two models sharing
a basename.

## What is deliberately not tested

- **The 1D pipeline.** Needs GDAL and real model output.
- **Anything requiring a real browser** -- MapLibre, canvas upload, the worker
  message protocol. The `?verify=1` oracle covers the paint path in a real
  browser and stays the acceptance step before a deploy.
- **h5wasm decode.** `readStack()` is the seam; everything past it is tested,
  and h5wasm is a vendored third-party library with its own tests.

## Adding a test

Put it in the suite matching what it needs, and name it for the failure it
catches rather than the function it calls. Several tests here exist because a
specific bug shipped once; the comment saying which one is the useful part.
