"""Synthesise a small ras2fim-2d NetCDF, for tests that need a real file.

The published sample is 2.35 MB, which is fine to serve and wrong to commit as a
test fixture. These files are a few kilobytes and are written into a temporary
directory, never into the repository.

The point is not to imitate ras2fim-2d's hydraulics. It is to carry exactly the
structure the reader and the manifest builder depend on -- packed ``uint16``
with ``scale_factor``, a ``_FillValue`` for dry cells, a ``spatial_ref`` with a
GeoTransform, and the ``00_``/``01_`` global attributes -- so that a change to
either side of that contract fails a test instead of a demo.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

FILL = 65535

#: A grid small enough to be instant, in the pilot library's corner of Texas.
#: The origin is Web Mercator metres, because ras2fim-2d writes EPSG:3857 and
#: the viewer's whole no-reprojection argument rests on that.
ORIGIN_X = -10832000.0
ORIGIN_Y = 3530000.0
CELL_M = 3.0


def write_stack(
    path: Path,
    *,
    stream_id: str = "wb-1000001",
    variable: str = "wsel",
    nx: int = 24,
    ny: int = 16,
    flows: tuple[float, ...] = (100.0, 500.0, 2000.0),
    scale: float = 0.1,
    vertical_filter: str | None = "none",
    rotated: bool = False,
) -> Path:
    """Write one stack and return its path.

    ``variable`` is ``wsel`` (with terrain, the common case) or ``depth``
    (already depth, no terrain -- the branch that had never been exercised).
    """
    import netCDF4

    path.parent.mkdir(parents=True, exist_ok=True)
    terrain_raw = np.tile(np.arange(nx, dtype=np.uint16) * 2, (ny, 1))

    layers = np.empty((len(flows), ny, nx), dtype=np.uint16)
    for i, _ in enumerate(flows):
        # Water rises with flow from the left edge, so each layer wets strictly
        # more cells than the last -- and the dry right-hand side stays dry,
        # which is what makes a receding-flow bug visible.
        stage = terrain_raw + 4 + i * 6
        wet = np.arange(nx)[None, :] <= (nx // 3) + i * (nx // 4)
        layer = np.where(wet, stage, FILL).astype(np.uint16)
        # One deliberately below-terrain cell: a real product contains them, and
        # they must count as valid data without being painted.
        layer[0, 0] = max(0, int(terrain_raw[0, 0]) - 1)
        layers[i] = layer

    with netCDF4.Dataset(path, "w", format="NETCDF4") as nc:
        nc.createDimension("flow", len(flows))
        nc.createDimension("y", ny)
        nc.createDimension("x", nx)

        flow = nc.createVariable("flow", "f8", ("flow",))
        flow.units = "cfs"
        flow[:] = np.array(flows, dtype="f8")

        # Cell centres, not corners -- which is exactly why the extent is read
        # from the GeoTransform instead of from these.
        xs = nc.createVariable("x", "f8", ("x",))
        ys = nc.createVariable("y", "f8", ("y",))
        xs[:] = ORIGIN_X + (np.arange(nx) + 0.5) * CELL_M
        ys[:] = ORIGIN_Y - (np.arange(ny) + 0.5) * CELL_M

        rot = "0.5" if rotated else "0"
        ref = nc.createVariable("spatial_ref", "i4")
        ref.GeoTransform = (
            f"{ORIGIN_X} {CELL_M} {rot} {ORIGIN_Y} {rot} {-CELL_M}"
        )
        ref.spatial_ref = "EPSG:3857"

        if variable == "wsel":
            data = layers
        else:
            # depth = wsel - terrain, in raw units, with fill preserved.
            wet_mask = layers != FILL
            data = np.where(wet_mask, layers.astype(np.int32) - terrain_raw[None, :, :], FILL)
            data = np.clip(data, 0, FILL).astype(np.uint16)

        var = nc.createVariable(variable, "u2", ("flow", "y", "x"), fill_value=FILL)
        var.scale_factor = scale
        var.units = "feet"
        var[:] = data

        if variable == "wsel":
            terrain = nc.createVariable("terrain", "u2", ("y", "x"), fill_value=FILL)
            terrain.scale_factor = scale
            terrain.units = "feet"
            terrain[:] = terrain_raw

        nc.setncattr("00_stream_id", stream_id)
        nc.setncattr("01_type", variable)
        if vertical_filter is not None:
            nc.setncattr("09_vertical_filter", vertical_filter)

    return path


def write_not_a_stack(path: Path) -> Path:
    """A NetCDF that is valid but is not a ras2fim-2d product.

    ``describe()`` must return None for it, and the builder must leave it out of
    the published output rather than copying it and omitting it from the
    manifest -- present but unlisted is the worst of both.
    """
    import netCDF4

    path.parent.mkdir(parents=True, exist_ok=True)
    with netCDF4.Dataset(path, "w", format="NETCDF4") as nc:
        nc.createDimension("t", 3)
        temperature = nc.createVariable("temperature", "f4", ("t",))
        temperature[:] = [1.0, 2.0, 3.0]
    return path
