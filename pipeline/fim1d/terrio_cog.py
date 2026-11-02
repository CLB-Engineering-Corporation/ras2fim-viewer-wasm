"""Experimental writer beneath finish_cog; never generates overview algorithms."""

from pathlib import Path

import numpy as np
from osgeo import gdal


def write_existing_overviews(source: Path, destination: Path, creation: list[str]) -> dict:
    import terrio

    ds = gdal.Open(str(source))
    bands = [ds.GetRasterBand(i + 1) for i in range(ds.RasterCount)]
    levels = bands[0].GetOverviewCount()
    overviews = [
        np.stack([band.GetOverview(i).ReadAsArray() for band in bands]) for i in range(levels)
    ]
    options = dict(entry.split("=", 1) for entry in creation)
    # Supplied arrays are authoritative; no writer resampler is selected.
    for key in ("OVERVIEWS", "OVERVIEW_RESAMPLING", "NUM_THREADS", "MAX_Z_ERROR_OVERVIEW"):
        options.pop(key, None)
    terrio.open_raster(str(source), lazy=True).write(
        str(destination),
        driver="COG",
        compress=options.pop("COMPRESS"),
        tile_size=int(options.pop("BLOCKSIZE")),
        options=options,
        overviews=overviews,
        metadata=ds.GetMetadata(),
    )
    return {
        "backend": "terrio",
        "version": getattr(terrio, "__version__", "unknown"),
        "supplied_levels": levels,
        "options": options,
        "experimental": True,
    }
