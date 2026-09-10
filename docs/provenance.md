# Where the data and the code came from

Part of [ras2fim-viewer-wasm](../README.md).

## Provenance

Three of these are internal CLB repositories rather than public ones, named
here because the lineage matters to anyone changing the code, not because the
link resolves.

- Frontend shell, sidebar behaviour, and manifest-driven catalog pattern from
  `clb-ebfe-webmap` (CLB internal).
- Raster publication contract from `clb_lwi_webmap` (CLB internal). Read its
  `WEBMAP_BEST_PRACTICES_FROM_RBFS_2026-08-24.md` and
  `docs/RBFS_AUDIT_ADOPTION.md` before changing anything about raster
  publication. `pipeline/fim1d/cog_postprocess.py` is vendored from it, and the
  divergences are deliberately only two: a CONUS-wide `DEFAULT_ENVELOPE` and a
  `FIM` metadata prefix.
- Source data produced by CLB's Linux fork of
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
