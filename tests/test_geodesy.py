"""Rules in pipeline/common/geodesy.py, held against a shared fixture.

``tests/fixtures/geodesy_cases.json`` is also read by
``tests/netcdf-reader.test.mjs``. The two implementations exist because the
browser cannot import Python; the fixture is what stops them drifting.

Stdlib ``unittest`` rather than pytest, deliberately: this suite is meant to run
on a checkout with nothing installed, which is also what makes it cheap to run
in CI.
"""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from pipeline.common.geodesy import (
    CONUS_ENVELOPE,
    GeodesyError,
    geotransform_error,
    grid_bounds_lonlat,
    is_north_up,
    looks_like_lonlat,
    mercator_to_lonlat,
    parse_geotransform,
    transform_bounds,
    union_bounds,
)

CASES = json.loads((Path(__file__).parent / "fixtures" / "geodesy_cases.json").read_text("utf-8"))


class MercatorTest(unittest.TestCase):
    def test_matches_shared_fixture(self):
        tol = CASES["mercator_tolerance_deg"]
        for case in CASES["mercator"]:
            with self.subTest(case["name"]):
                lon, lat = mercator_to_lonlat(case["x"], case["y"])
                self.assertAlmostEqual(lon, case["lon"], delta=tol)
                self.assertAlmostEqual(lat, case["lat"], delta=tol)

    def test_origin_is_null_island(self):
        self.assertEqual(mercator_to_lonlat(0.0, 0.0), (0.0, 0.0))

    def test_is_odd_about_the_equator(self):
        _, north = mercator_to_lonlat(0.0, 5_000_000.0)
        _, south = mercator_to_lonlat(0.0, -5_000_000.0)
        self.assertAlmostEqual(north, -south, delta=1e-12)


class GeoTransformTest(unittest.TestCase):
    def test_matches_shared_fixture(self):
        for case in CASES["geotransform"]:
            with self.subTest(case["name"]):
                gt = parse_geotransform(case["text"])
                self.assertEqual(gt is not None, case["valid"])
                self.assertEqual(geotransform_error(case["text"]), case["error"])
                if gt is not None:
                    self.assertEqual(gt, case["parsed"])
                    self.assertEqual(is_north_up(gt), case["north_up"])

    def test_none_is_absent_not_a_crash(self):
        self.assertIsNone(parse_geotransform(None))
        self.assertEqual(geotransform_error(None), "is absent")

    def test_non_finite_is_rejected_before_it_reaches_json(self):
        # A NaN survives a length check and then serialises as bare `NaN`, which
        # is not valid JSON and fails in the browser at JSON.parse -- a long way
        # from the cause. This is the reason the rule lives in the parser.
        for text in ("0 1 0 0 0 NaN", "0 1 0 Infinity 0 -1", "0 1 0 0 0 -Infinity"):
            with self.subTest(text):
                self.assertIsNone(parse_geotransform(text))


class TransformBoundsTest(unittest.TestCase):
    def test_north_up_grid(self):
        # 10x20 cells of 2 units, origin at the top-left corner.
        self.assertEqual(transform_bounds((100, 2, 0, 500, 0, -2), 10, 20),
                         (100.0, 460.0, 120.0, 500.0))

    def test_four_corners_beat_two_on_a_rotated_grid(self):
        # The two-corner shortcut this replaced took only (0,0) and (w,h). For a
        # rotated transform that misses the extremes, which is the whole reason
        # the shared version maps all four.
        # A 45-degree rotation, where the (0,0)-(w,h) diagonal is the axis the
        # grid was rotated about: those two corners share an easting, so the
        # shortcut reports zero width for a grid 20 units across.
        gt = (0, 1, -1, 0, 1, 1)
        w, h = 10, 10
        two_corner_xs = [gt[0], gt[0] + w * gt[1] + h * gt[2]]
        two_corner_ys = [gt[3], gt[3] + w * gt[4] + h * gt[5]]
        two = (min(two_corner_xs), min(two_corner_ys), max(two_corner_xs), max(two_corner_ys))
        four = transform_bounds(gt, w, h)
        self.assertNotEqual(two, four)
        # The correct box must contain every corner.
        for x, y in ((0, 0), (w, 0), (0, h), (w, h)):
            px = gt[0] + x * gt[1] + y * gt[2]
            py = gt[3] + x * gt[4] + y * gt[5]
            self.assertTrue(four[0] <= px <= four[2] and four[1] <= py <= four[3])

    def test_agrees_with_two_corner_form_when_north_up(self):
        # The change must be a no-op for every raster this project actually
        # ships, or the 1D manifests would move.
        gt = (-10832000.5, 3.0, 0.0, 3530000.25, 0.0, -3.0)
        w, h = 1963, 1331
        xs = [gt[0], gt[0] + w * gt[1] + h * gt[2]]
        ys = [gt[3], gt[3] + w * gt[4] + h * gt[5]]
        self.assertEqual(transform_bounds(gt, w, h),
                         (min(xs), min(ys), max(xs), max(ys)))


class GridBoundsTest(unittest.TestCase):
    def test_uses_corners_not_cell_centres(self):
        gt = parse_geotransform("0 1000 0 1000000 0 -1000")
        west, south, east, north = grid_bounds_lonlat(gt, 10, 10)
        self.assertEqual((west, north), mercator_to_lonlat(0.0, 1000000.0))
        self.assertEqual((east, south), mercator_to_lonlat(10000.0, 990000.0))

    def test_rotated_grid_refuses(self):
        gt = parse_geotransform("0 1 0.5 0 -0.25 -1")
        with self.assertRaises(GeodesyError):
            grid_bounds_lonlat(gt, 10, 10)


class UnionBoundsTest(unittest.TestCase):
    def test_absent_operands(self):
        box = (0.0, 1.0, 2.0, 3.0)
        self.assertIsNone(union_bounds(None, None))
        self.assertEqual(union_bounds(None, box), box)
        self.assertEqual(union_bounds(box, None), box)

    def test_grows_to_contain_both(self):
        self.assertEqual(union_bounds((0, 0, 1, 1), (-1, 5, 2, 6)), (-1, 0, 2, 6))

    def test_disjoint_boxes_do_not_silently_swap_corners(self):
        merged = union_bounds((10, 10, 11, 11), (-5, -5, -4, -4))
        self.assertEqual(merged, (-5, -5, 11, 11))
        self.assertLess(merged[0], merged[2])
        self.assertLess(merged[1], merged[3])


class LonLatEnvelopeTest(unittest.TestCase):
    def test_accepts_the_pilot_unit(self):
        self.assertTrue(looks_like_lonlat((-97.304721, 29.933722, -97.150918, 30.246769)))

    def test_rejects_state_plane_eastings(self):
        # The failure this guards: a depth grid still in EPSG:2277 feet, tagged
        # geographic. It lands in the Southern Ocean, and nothing else notices.
        self.assertFalse(looks_like_lonlat((3270000.0, 13900000.0, 3280000.0, 13910000.0)))

    def test_rejects_inverted_boxes(self):
        self.assertFalse(looks_like_lonlat((10.0, 0.0, -10.0, 1.0)))
        self.assertFalse(looks_like_lonlat((0.0, 10.0, 1.0, -10.0)))

    def test_conus_envelope_is_itself_plausible_lonlat(self):
        self.assertTrue(looks_like_lonlat(CONUS_ENVELOPE))


if __name__ == "__main__":
    unittest.main()
