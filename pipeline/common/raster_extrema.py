"""Exact depth bounds, including an explicit all-invalid normalization sentinel."""
import math


def exact_depth_range(band) -> tuple[float, float]:
    """Return base extrema; (0,0) for verified all-invalid data is not a sample.

    GDAL raises for an all-nodata band. Only that case is converted to the dry
    normalization bound. I/O failures or failed extrema on real data propagate.
    """
    try:
        result = band.ComputeRasterMinMax(False)
        if all(math.isfinite(v) for v in result):
            return result
        failure = RuntimeError("non-finite exact raster extrema")
    except RuntimeError as error:
        failure = error
    import numpy as np

    nodata = band.GetNoDataValue()
    width, height = band.GetBlockSize()
    width, height = max(1, min(width, 1024)), max(1, min(height, 1024))
    for y in range(0, band.YSize, height):
        for x in range(0, band.XSize, width):
            values = band.ReadAsArray(x, y, min(width, band.XSize - x), min(height, band.YSize - y))
            if values is None:
                raise failure
            valid = np.isfinite(values)
            if nodata is not None:
                valid &= values != nodata
            if valid.any():
                raise failure
    return 0.0, 0.0
