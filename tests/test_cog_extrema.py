"""Real base-resolution extrema guard; run in lwi-gdal."""

import unittest
from unittest.mock import Mock

try:
    from osgeo import gdal
except ImportError:
    gdal = None


@unittest.skipIf(gdal is None, "requires the lwi-gdal environment")
class ExactDepthExtrema(unittest.TestCase):
    def test_all_nodata_has_explicit_dry_normalization_bound(self):
        from pipeline.common.raster_extrema import exact_depth_range

        gdal.UseExceptions()
        for nodata in (-9999, float("nan")):
            ds = gdal.GetDriverByName("MEM").Create("", 9, 7, 1, gdal.GDT_Float32)
            band = ds.GetRasterBand(1)
            band.SetNoDataValue(nodata)
            band.Fill(nodata)
            self.assertEqual(exact_depth_range(band), (0, 0))

    def test_failed_extrema_on_valid_data_or_failed_read_propagates(self):
        import numpy as np

        from pipeline.common.raster_extrema import exact_depth_range

        for values in (None, np.array([[1]], dtype="float32")):
            band = Mock(XSize=1, YSize=1)
            band.ComputeRasterMinMax.side_effect = RuntimeError("injected read failure")
            band.GetNoDataValue.return_value = -9999
            band.GetBlockSize.return_value = (1, 1)
            band.ReadAsArray.return_value = values
            with self.assertRaisesRegex(RuntimeError, "injected read failure"):
                exact_depth_range(band)

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
