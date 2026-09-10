"""Build tooling for the ras2fim viewers.

Two products, two subpackages, because they share almost nothing:

``fim1d``
    ras2fim 1D output -- dozens of separate GeoTIFFs in a projected CRS -- warped
    to COGs and served through TiTiler. Needs the GDAL Python bindings.

``fim2d``
    ras2fim-2d output -- one NetCDF per stream, already EPSG:3857 -- published
    as-is and read directly in the browser. Needs only ``netCDF4``, and must NOT
    be run in the GDAL environment it does not require.

``common``
    The handful of things both genuinely share.

Run a tool as a module from the repository root::

    python -m pipeline.fim2d.site <dir-of-nc> --out site/
    python -m pipeline.fim1d.validate --frontend src/viewer-1d
"""
