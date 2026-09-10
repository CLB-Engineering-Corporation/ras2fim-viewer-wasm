# How the map draws what ras2fim produced

Part of [ras2fim-viewer-wasm](../README.md).

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
`fim1d/validate.py` reports this as a warning rather than a failure, because
it is a property of the model, not of the publication.

## Rendering contract

Inherited from `clb_lwi_webmap` — `pipeline/fim1d/cog_postprocess.py` is vendored from
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
