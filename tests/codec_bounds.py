"""Bounds for the supplied Float32 COG conformance fixture, excluding nodata."""

import numpy as np


def check_codec_bound(reference, actual, nodata=-9999.0, bound=0.01):
    assert reference.shape == actual.shape
    assert np.array_equal(reference == nodata, actual == nodata), "nodata mask changed"
    valid = np.isfinite(reference) & (reference != nodata)
    assert np.isfinite(actual[valid]).all(), "valid pixels became nonfinite"
    if not valid.any():
        return 0.0, bound
    magnitude = np.float32(np.max(np.abs(reference[valid])))
    tolerance = bound + float(np.spacing(magnitude))
    error = float(np.max(np.abs(reference[valid] - actual[valid])))
    assert error <= tolerance, (error, tolerance)
    return error, tolerance
