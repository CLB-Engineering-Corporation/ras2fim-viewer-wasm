# Changelog

Notable changes to this repository. Dated records of *why* a decision was taken
live in [feature_dev_notes/](feature_dev_notes/README.md); this is the summary.

## 0.3.0 — 2026-09-11

### Added

- **The 1D dashboard can be published without a tile server.**
  `pipeline/fim1d/depth_pmtiles.py` bakes each profile's depth grid into its own
  PMTiles archive, and `pipeline/fim1d/site.py` assembles a self-contained
  release. The pilot library is 72 profiles in 4.8 MB, because a flood is a thin
  corridor inside a much larger model bounding box and every fully transparent
  tile is skipped.
- **Live 1D demo** at `/1d/`, alongside the 2D viewer at the root.
- `pipeline/common/ramp.py` — the depth colour ramp, defined once and shared by
  the dev tile server and the tile baker.
- `.conventions.yaml` and `pipeline/check_conventions.py` — the repository's
  rules with their reasoning, and enforcement of the mechanical subset.
- `pyproject.toml`, naming the two dependency groups that already existed in
  prose, plus a `test` group that is what CI installs.
- `CONTRIBUTING.md`, `CHANGELOG.md`, and `docs/` — the README was one file doing
  five jobs.

### Changed

- **CLI normalised.** The thing being read is a positional argument everywhere;
  `--frontend`, `--site` and `--json` are gone. Output is `--out`, and
  machine-readable output is `--report`, on every tool. The positional is named
  `unit` where the argument genuinely is a ras2fim output unit, which
  `.conventions.yaml` records as a deliberate exception.
- **GDAL is imported lazily in `pipeline/fim1d/validate.py`**, so a published
  release can be validated on the host that will serve it. Vector layer names
  degrade to a header check and a warning when GDAL is absent.
- `serve/` is a package, so the preview servers can import from `pipeline`.
  Run them as `python -m serve.range_server`.
- The published manifest stops naming the COGs a release does not carry.

### Fixed

- `parseGeoTransform` in `src/viewer-2d/netcdf.js` tested finiteness with
  `parts.some(isNaN)`, and `isNaN(Infinity)` is `false`, so it accepted an
  infinite origin that the Python side rejected. Found by the cross-language
  fixture the first time the two were compared.

## 0.2.0 — 2026-09-10

### Added

- **Test suite and CI.** 65 tests in about a second: the sparse-vs-dense paint
  oracle in Node with no browser, geodesy held against a shared cross-language
  fixture, the destructive-`--clean` refusals, and a NetCDF round trip.

### Changed

- **Restructured around the 1D/2D split.** `src/viewer-1d`, `src/viewer-2d`,
  `pipeline/fim1d`, `pipeline/fim2d`, `pipeline/common`. The layout had said
  "1D is the product, 2D is a variant" while the repository was named after the
  2D path. Verified by a byte-identical rebuild.
- The working directory, the GitHub repository and the README title are now the
  same name.
- Four duplicated Python copies of the Web Mercator and `GeoTransform` rules
  collapsed into `pipeline/common/geodesy.py`. One had already drifted.

## 0.1.0 — 2026-09-09

### Added

- **Browser-native 2D viewer.** ras2fim-2d NetCDF read directly with h5wasm in a
  Web Worker: no tile server, no conversion step.
- Sparse wet-cell painting: 13.0 ms to **0.8 ms** per layer, a 16.3×
  improvement, with the dense renderer retained as the oracle that proves the
  two agree byte for byte.
- 1D dashboard: COGs, vector PMTiles, generated manifest, rating-curve readouts,
  and a `--deep` validator.

### Fixed

- HTML injection: NetCDF attributes reached `innerHTML`.
- `--clean` could delete the source directory.
- Duplicate basenames silently collapsed two streams into one.
- Rejected files stayed in the output, downloadable and unlisted.
- `int()` truncated non-integer flows; NaN transforms serialised as invalid JSON.
- The advertised `depth` variable subtracted terrain twice.
- `ComputeRasterMinMax(True)` read the overview pyramid and under-reported the
  library peak, which the colour ramp is built from.
