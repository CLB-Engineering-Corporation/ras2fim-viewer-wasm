# The 1D path, proven — and what example data actually exists

**Date:** 2026-09-11
**Closes:** the "1D is currently unproven" item from
[2026-09-10-architecture-audit.md](2026-09-10-architecture-audit.md)

---

## The 1D path works end to end

Verified in a real browser against the pilot unit
`12090301_2277_ble_260901` (Alum Creek–Colorado River, FEMA Base Level
Engineering, EPSG:2277, ras2fim v2.0.3.1, 72 profiles, one model of twenty
catalogued).

| Profile | Stage, NWM 5789842 | Discharge | What the map shows |
|---|---|---|---|
| 21 of 72 | 7.07 ft | 782 cfs | water confined to the channel and two ponds |
| 72 of 72 | 16.43 ft | 19,351 cfs | the full floodplain, deep channel visible |

Both render the depth grid, the model extent, the cross sections and the stream
centreline together, with the reach readouts tracking the profile. The colour
ramp stays fixed at 0–31.8 ft across every profile, which is the point of it:
the ramp shows the flood rising rather than restretching at each step.

The tile requests confirm the contract rather than merely the picture:

```
/cog/tiles/WebMercatorQuad/15/7531/13514.png
  ?url=...%2Fdepth_060.tif&rescale=0,31.836
  &colormap_name=blues&nodata=-9999&resampling=nearest
```

32 tiles, all 200, carrying the library maximum as `rescale` and not the
profile's own maximum.

## Why it looked broken for so long

The "Depth tiles unavailable" notice was a red herring. The real behaviour is
that an agent-driven Chrome tab reports `document.hidden === true`, so Chrome
never fires `requestAnimationFrame`, MapLibre's render loop never runs, and it
**never requests a tile at all**.

Everything else keeps working — the manifest loads, the profile readout counts
up, the rating curves update — so the failure presents as "the numbers move and
the map does not", which reads exactly like a broken raster layer.

The diagnostic that settled it: `curl` gets a 200 and an 857-byte PNG from
`/cog/tiles/...` while the browser's own network log contains zero tile
requests. One real drag on the canvas and 32 tiles arrive at once.

This is the same constraint already recorded for the 2D viewer's worker, which
is never scheduled in a hidden tab. It is now in `AGENTS.md` for both.

## Example data: what is actually available

Searched `H:\CLB-Repos` exhaustively for ras2fim-shaped output. Exactly two
trees exist:

| Path | What it is |
|---|---|
| `ras-commander/feature_dev_notes/.old/RRASSLER/inst/extdata/sample_ras/ras2fim-v1-sample-dataset/` | the public **ras2fim v1** sample (Iowa, HUC 101702040606) |
| `ras2fim-viewer-wasm/src/viewer-1d/cogs/12090301_2277_ble_260901/` | COGs this pipeline already built from `C:\ras2fim_data` |

**The v1 sample cannot drive this viewer.** It carries five NWM features, each
with a HEC-RAS model and a rating curve, and **no rasters of any kind** — the
whole inventory is 11 HDF, 6 each of `.r01`/`.prj`/`.p01`/`.g01`/`.f01`/`.O01`,
6 CSVs, 5 `.rasmap`, 5 PNG. Its rating curves are metric
(`Flow(cms),AvgDepth(m)`) and its layout is the v1
`05_hecras_output/HUC_<huc12>/<feature_id>/` shape, not the v2
`<model_id>_<model_name>/` shape `pipeline/fim1d/source.py` reads.

It is a useful conflation and rating-curve fixture. It is not a FIM library, and
a depth library is what the viewer exists to show.

So the pilot unit on `C:\ras2fim_data` remains the only depth library
available, and it is not public. Publishing a 1D demo alongside the live 2D one
still needs either a redistributable unit or permission for this one.

## Still open

- **A public 1D example.** NOAA's `noaa-nws-owp-fim` bucket is 403 anonymous.
  The eBFE 1D corpus named in `ras2fim/CLB-development/representative-1d-corpus.md`
  is CLB-selected and its projects are still pending selection.
- **A second unit.** Everything proven here is one model of the twenty
  catalogued in the pilot unit. Multi-model and multi-unit selection are wired
  and validated but have never been exercised against real second data.
