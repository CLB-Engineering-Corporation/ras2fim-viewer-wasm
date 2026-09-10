"""ras2fim-2d: NetCDF published as-is, catalogued for the browser viewer.

Deliberately GDAL-free -- ``netCDF4`` is enough to read metadata and write JSON,
so these run on the plain interpreter. There is no conversion step: the files
are published byte-for-byte as ras2fim-2d wrote them.
"""
