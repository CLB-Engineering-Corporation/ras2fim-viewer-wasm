"""The depth colour ramp, which three things have to agree on.

``serve/dev_tiles.py`` applies it per request, ``pipeline/fim1d/depth_pmtiles.py``
bakes it into PNG pixels, and the viewer's legend draws it in CSS. The first two
share ``pipeline/common/ramp.py``; this pins what they share.

Needs numpy for ``table()``; everything else is stdlib.
"""

from __future__ import annotations

import unittest

from pipeline.common import ramp


class ControlPointTest(unittest.TestCase):
    def test_every_ramp_spans_zero_to_one(self):
        for name in ramp.COLORMAPS:
            with self.subTest(name):
                points = ramp.control_points(name)
                self.assertEqual(points[0][0], 0.0)
                self.assertEqual(points[-1][0], 1.0)

    def test_positions_ascend(self):
        for name in ramp.COLORMAPS:
            with self.subTest(name):
                positions = [p[0] for p in ramp.control_points(name)]
                self.assertEqual(positions, sorted(positions))

    def test_channels_are_bytes(self):
        for name in ramp.COLORMAPS:
            for point in ramp.control_points(name):
                for channel in point[1:]:
                    self.assertTrue(0 <= channel <= 255, f"{name}: {point}")

    def test_an_unknown_name_falls_back_rather_than_raising(self):
        # A bad --colormap should render the default, not abort a build that has
        # already spent minutes on GDAL.
        self.assertEqual(ramp.control_points("not-a-ramp"), ramp.control_points(ramp.DEFAULT))

    def test_lookup_is_case_insensitive(self):
        self.assertEqual(ramp.control_points("Blues"), ramp.control_points("blues"))

    def test_the_default_exists(self):
        self.assertIn(ramp.DEFAULT, ramp.COLORMAPS)


class TableTest(unittest.TestCase):
    def test_shape_and_dtype(self):
        table = ramp.table()
        self.assertEqual(table.shape, (256, 3))
        self.assertEqual(table.dtype.name, "uint8")

    def test_ends_match_the_control_points(self):
        points = ramp.control_points("blues")
        table = ramp.table("blues")
        for channel in range(3):
            self.assertEqual(int(table[0, channel]), points[0][channel + 1])
            self.assertEqual(int(table[255, channel]), points[-1][channel + 1])

    def test_blues_darkens_monotonically(self):
        # The ramp reads as "deeper water is darker". If a future edit breaks
        # that, the map stops being readable without anything erroring.
        table = ramp.table("blues")
        luminance = table.astype(int).sum(axis=1)
        self.assertGreater(luminance[0], luminance[255])
        # Allow tiny non-monotonic wobble from integer rounding between stops.
        rises = sum(1 for a, b in zip(luminance, luminance[1:]) if b > a)
        self.assertLessEqual(rises, 4, "blues should get darker, not lighter")


class CssTest(unittest.TestCase):
    def test_stops_are_hex(self):
        for position, colour in ramp.stops():
            self.assertTrue(0.0 <= position <= 1.0)
            self.assertRegex(colour, r"^#[0-9a-f]{6}$")

    def test_gradient_mentions_every_stop(self):
        gradient = ramp.css_gradient("blues")
        self.assertTrue(gradient.startswith("linear-gradient(to right,"))
        for _, colour in ramp.stops("blues"):
            self.assertIn(colour, gradient)

    def test_gradient_matches_the_raster_table_at_its_ends(self):
        # The legend and the pixels must start and end on the same colour, or
        # the scale beside the map lies about the map.
        table = ramp.table("blues")
        first = "#%02x%02x%02x" % tuple(int(v) for v in table[0])
        last = "#%02x%02x%02x" % tuple(int(v) for v in table[255])
        colours = [c for _, c in ramp.stops("blues")]
        self.assertEqual(colours[0], first)
        self.assertEqual(colours[-1], last)


if __name__ == "__main__":
    unittest.main()
