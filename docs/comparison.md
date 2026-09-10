# Why a webmap rather than an existing FIM viewer

Part of [ras2fim-viewer-wasm](../README.md).

## Why a webmap rather than an existing FIM viewer

There is no reusable open-source FIM viewer to adopt. The NOAA-OWP ecosystem
publishes production and evaluation code, not visualization:
[`inundation-mapping`](https://github.com/NOAA-OWP/inundation-mapping),
[`ripple1d`](https://github.com/Dewberry/ripple1d),
[`ripple1d-pipeline`](https://github.com/NOAA-OWP/ripple1d-pipeline),
[`flows2fim`](https://github.com/NOAA-OWP/flows2fim) (emits VRT and says "view
in QGIS"; no viewer component), and
[`gval`](https://github.com/NOAA-OWP/gval) (agreement maps and metrics, plotted
in notebooks). The government-facing viewers —
[USGS Flood Inundation Mapper](https://apps.usgs.gov/fim/), whose gage-height
slider is the closest published analogue to this map's profile slider, and the
[NOAA National Water Prediction Service viewer](https://viewer.weather.noaa.gov/water)
over [HydroVIS](https://maps.water.noaa.gov/server/rest/services) — are closed.
CLB already had the better starting point in-house.
