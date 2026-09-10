# Publishing a release

Part of [ras2fim-viewer-wasm](../README.md).

## Deployment

`config.js` is the only file that differs between environments. In production
`rasterTileBase` points at a **same-origin** nginx path proxied to TiTiler — no
CORS, no mixed content — following `clb_lwi_webmap`'s `/lwi-tiles/*`. See
`deploy.example.json`.

Build COGs and PMTiles on a trusted internal worker. The public web host
should serve released artifacts only -- never run extraction or raster
generation there.
