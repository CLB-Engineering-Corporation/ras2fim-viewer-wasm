"""Pinned writer beneath finish_cog; never generates overview algorithms."""

from pathlib import Path

import numpy as np
from osgeo import gdal


def write_existing_overviews(source: Path, destination: Path, creation: list[str]) -> dict:
    from ..common.terrio_runtime import load_lock, require_terrio
    terrio = require_terrio()

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
    # The supplied levels have GDAL's GTiff overview sizes, ceil(n / f). Terrio writes those
    # only under its SOURCE overview policy; its default (GDAL_3_13) halves and floors each
    # level and refuses them. Recorded in the returned options, so the report states it.
    options["COG_OVERVIEW_POLICY"] = "SOURCE"
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
        "source_commit": load_lock()["source_commit"],
    }
