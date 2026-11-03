# Tests

```sh
node --test tests/*.test.mjs                # the browser reader, no dependencies
python -m unittest discover -s tests -t .   # the pipeline, needs numpy + netCDF4
python -m pipeline.check_conventions        # the rules in .conventions.yaml
```

All three run in about a second. None needs a browser, a tile server, GDAL,
any committed data, or the network -- the round-trip test builds against a
temporary viewer root with stub vendor files, so it never triggers
`fetch-vendor.sh`.

## Why the suite is split

The repository spans two environments on purpose, and the tests follow that
split rather than papering over it.

| Suite | Runner | Needs | Covers |
|---|---|---|---|
| `netcdf-reader.test.mjs` | `node --test` | nothing | the browser reader: sparse-vs-dense oracle, clearing, packing, the two "wet" populations, bbox, ramp packing |
| `native-viewer-api.test.mjs` | `node --test` | nothing | synthetic metadata checks, depth/extent sessions, stable selection, cancellation, stale messages and the shipped worker protocol in a VM; no real WASM/data qualification |
| `test_geodesy.py` | `unittest` | nothing | `pipeline/common/geodesy.py`, and its agreement with the JavaScript copy |
| `test_site_safety.py` | `unittest` | `netCDF4` | the destructive-`--clean` refusals and the `VIEWER_FILES` contract |
| `test_roundtrip.py` | `unittest` | `netCDF4`, `numpy` | build a site from synthesised NetCDF, then deep-validate it |
| `test_site_1d.py` | `unittest` | `netCDF4` | building a publishable 1D release, and every refusal it makes |
| `test_ramp.py` | `unittest` | `numpy` | the depth colour ramp three things have to agree on |
| `test_conventions.py` | `unittest` | nothing | the conventions checker, and that it needs nothing installed |

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

## Viewer redraw regressions

`viewer-redraw.test.mjs` runs the shipped 1D/2D orchestration functions in a
small Node VM harness. It checks profile switching while sources are loading,
initial style readiness, and the pixels copied to the 2D canvas on receding,
disjoint, and dry frames. It runs in the existing Node CI job. These are
orchestration tests; visual browser checks remain necessary for WebGL delivery.

## Experimental Terrio acceptance

The optional GDAL environment now runs the exact-extrema and PMTiles atomic
publication regressions in `test_cog_extrema.py` and `test_depth_tiles_trial.py`.
`terrio-empty-publication.py` builds a synthetic all-nodata / real-wet static
release from the preserved local pilot corpus; `terrio-empty-browser.mjs` checks
wet -> dry -> wet rendering with the actual shipped 1D app and MapLibre in all
three browser engines. These scripts require the local `.terrio-validation/`
fixtures described in the feature handover; generated datasets are not committed.
The release uses one transparent z0 sentinel per empty profile, never an absent
archive or a tile-service fallback. Browser render/retention measurements and
strict evidence auditing are documented in `viewer_acceptance/README.md`.

## Native publication on every reviewed platform

The `native` CI job runs, with GDAL 3.13.3 and each platform's reviewed Terrio
wheel (Linux x86_64/arm64, macOS arm64/x86_64, Windows): the whole suite above
(the GDAL-gated tests become active), `terrio-publication.py` (exact
Terrio-vs-GDAL archives on synthetic fixtures; COG codec bounds against the
exact supplied arrays; atomicity) and `terrio-synthetic-default.py`
(omitted-backend default dispatch on a synthetic State Plane grid). Set
`PMTILES_CLI` to the go-pmtiles binary. `native-identity` then requires every
platform's Terrio tiles to equal the reviewed Windows wheel's wherever the
tilers received identical input (`terrio-synthetic-compare.py`). See
docs/terrio-assets.md for what is exact and what is reported.

## Safari and Mobile Safari

`safari_acceptance/` -- see its README. `safari.test.mjs` runs in the Node job
(pins, threshold derivation, macOS process attribution); the browser sessions
run in `.github/workflows/safari-acceptance.yml`.

