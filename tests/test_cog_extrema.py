"""Real base-resolution extrema guard; run in lwi-gdal."""

import unittest

try:
    from osgeo import gdal
except ImportError:
    gdal = None


@unittest.skipIf(gdal is None, "requires the lwi-gdal environment")
class ExactDepthExtrema(unittest.TestCase):
    def test_overview_maximum_is_lower_than_base(self):
        import numpy as np

        ds = gdal.GetDriverByName("MEM").Create("", 1024, 1024, 1, gdal.GDT_Float32)
        values = np.ones((1024, 1024), dtype="float32")
        values[0, 0] = 100
        ds.GetRasterBand(1).WriteArray(values)
        ds.BuildOverviews("AVERAGE", [16])
        band = ds.GetRasterBand(1)
        self.assertLess(band.ComputeRasterMinMax(True)[1], 100)
        from pipeline.fim1d.cogs import _exact_depth_range

        self.assertEqual(_exact_depth_range(band), (1, 100))
