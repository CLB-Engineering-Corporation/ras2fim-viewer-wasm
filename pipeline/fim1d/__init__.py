"""ras2fim 1D: depth-grid GeoTIFFs -> COGs + PMTiles + manifest.

Requires the GDAL Python bindings (the ``lwi-gdal`` conda environment on CLB
workstations). ``cog_postprocess`` builds overview pyramids by writing overview
levels directly, which only the ``osgeo`` API exposes.
"""
