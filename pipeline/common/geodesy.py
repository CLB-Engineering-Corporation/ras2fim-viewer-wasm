"""Web Mercator, GeoTransform, and bounding boxes -- one implementation.

These were duplicated across four modules and had already started to drift: one
copy rejected rotated grids, another did not; one treated a non-finite
``GeoTransform`` as valid, another rejected it. The rules below are the union of
what each copy was doing correctly.

``src/viewer-2d/netcdf.js`` carries a JavaScript copy of ``mercator_to_lonlat``
and ``parse_geotransform`` because the browser cannot import this module. That
duplication is unavoidable; ``tests/test_geodesy.py`` asserts the two agree on a
shared fixture so it cannot drift silently.
"""

from __future__ import annotations

import math

#: Half the circumference of the Web Mercator plane, in metres.
MERCATOR_R = 20037508.342789244

#: Plausibility envelope for published FIM data, lon/lat: CONUS plus a margin.
#: The guard exists to catch a raster still carrying projected coordinates, or
#: one warped with the metre variant of a foot CRS -- both land far outside.
CONUS_ENVELOPE = (-130.0, 20.0, -60.0, 55.0)


class GeodesyError(ValueError):
    """Georeferencing that cannot be published as-is."""


def mercator_to_lonlat(x: float, y: float) -> tuple[float, float]:
    """EPSG:3857 metres to WGS84 degrees."""
    return (
        (x / MERCATOR_R) * 180.0,
        math.degrees(math.atan(math.exp((y / MERCATOR_R) * math.pi))) * 2.0 - 90.0,
    )


def parse_geotransform(text: str | None) -> dict[str, float] | None:
    """Parse GDAL's six-number GeoTransform, or return None if unusable.

    Order is ``originX pixelW rotX originY rotY pixelH``. Returns None rather
    than raising, because an unparseable transform means "this file is not
    publishable", which every caller handles by skipping the file.

    Non-finite values are rejected here rather than downstream: NaN survives a
    length check and then serialises as bare ``NaN``, which is not valid JSON
    and fails in the browser at ``JSON.parse``, a long way from the cause.
    """
    if not text:
        return None
    try:
        parts = [float(p) for p in str(text).split()]
    except ValueError:
        return None
    if len(parts) != 6 or not all(math.isfinite(p) for p in parts):
        return None
    return {
        "origin_x": parts[0], "pixel_w": parts[1], "rot_x": parts[2],
        "origin_y": parts[3], "rot_y": parts[4], "pixel_h": parts[5],
    }


def is_north_up(gt: dict[str, float]) -> bool:
    """True when the grid can be placed by its four corners alone.

    A rotated grid cannot: the viewer maps corner to corner and interpolates
    linearly between them, which is only correct for an axis-aligned raster.
    """
    return gt["rot_x"] == 0 and gt["rot_y"] == 0


def grid_bounds_lonlat(gt: dict[str, float], nx: int, ny: int) -> tuple[float, float, float, float]:
    """Lon/lat extent of a north-up EPSG:3857 grid, as (west, south, east, north).

    Derived from the GeoTransform, never from the x/y coordinate vectors: those
    are cell *centres*, and using them as an extent shifts the raster half a
    cell.
    """
    if not is_north_up(gt):
        raise GeodesyError("rotated grids cannot be placed by their corners")
    west, north = gt["origin_x"], gt["origin_y"]
    east = west + nx * gt["pixel_w"]
    south = north + ny * gt["pixel_h"]  # pixel_h is negative for north-up
    lon_w, lat_s = mercator_to_lonlat(west, south)
    lon_e, lat_n = mercator_to_lonlat(east, north)
    return (lon_w, lat_s, lon_e, lat_n)


def union_bounds(a: tuple | None, b: tuple | None) -> tuple | None:
    """Smallest box containing both, ignoring either if absent."""
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def looks_like_lonlat(bounds: tuple[float, float, float, float]) -> bool:
    """Whether a box is plausibly WGS84 degrees rather than projected units.

    A State Plane easting of 3.27e6 cannot pass this; nor can a raster warped
    with the wrong variant of a foot CRS, which lands thousands of kilometres
    from where it belongs.
    """
    x0, y0, x1, y1 = bounds
    return (
        x0 < x1 and y0 < y1
        and -180 <= x0 <= 180 and -180 <= x1 <= 180
        and -90 <= y0 <= 90 and -90 <= y1 <= 90
    )
