import unittest

import numpy as np

from tests.codec_bounds import check_codec_bound


class CodecBoundTests(unittest.TestCase):
    def test_nodata_magnitude_does_not_expand_valid_pixel_bound(self):
        reference = np.array([-9999.0, 31.0], dtype=np.float32)
        error, tolerance = check_codec_bound(reference, reference)
        self.assertEqual(error, 0)
        self.assertAlmostEqual(tolerance, 0.010001907348632813)
        with self.assertRaises(AssertionError):
            check_codec_bound(reference, np.array([-9999.0, 31.0105], dtype=np.float32))

    def test_nodata_and_nonfinite_corruption_are_rejected(self):
        reference = np.array([-9999.0, 1.0], dtype=np.float32)
        for actual in ([0.0, 1.0], [-9999.0, np.nan]):
            with self.assertRaises(AssertionError):
                check_codec_bound(reference, np.array(actual, dtype=np.float32))
