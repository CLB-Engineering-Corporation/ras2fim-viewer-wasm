"""Dependencies and atomic refusal for the experimental archive path."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from osgeo import gdal  # noqa: F401
except ImportError:
    gdal = None


@unittest.skipIf(gdal is None, "requires the lwi-gdal environment")
class DepthTilesTrial(unittest.TestCase):
    def test_missing_python_dependency_fails_before_colourization(self):
        import builtins

        from pipeline.fim1d import depth_pmtiles as module

        original = builtins.__import__

        def blocked(name, *args, **kwargs):
            if name.startswith("pmtiles"):
                raise ImportError("injected missing dependency")
            return original(name, *args, **kwargs)

        with (
            patch("builtins.__import__", side_effect=blocked),
            patch.object(module, "colourise") as colourise,
        ):
            with self.assertRaisesRegex(module.DepthTileError, "fim1d Python dependencies"):
                module.build_profile(Path("unused.tif"), Path("unused.pmtiles"), 10)
            colourise.assert_not_called()

    def test_all_dry_refuses_without_replacing_good_archive(self):
        from pipeline.fim1d import depth_pmtiles as module

        try:
            import pmtiles  # noqa: F401
        except ImportError:
            self.skipTest("requires declared pmtiles dependency")
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "good.pmtiles"
            target.write_bytes(b"prior archive")
            with (
                patch.object(module, "colourise", return_value=0),
                self.assertRaisesRegex(module.DepthTileError, "all-dry"),
            ):
                module.build_profile(Path("unused.tif"), target, 10, backend="terrio")
            self.assertEqual(target.read_bytes(), b"prior archive")
            self.assertEqual(list(Path(tmp).glob(".*partial*")), [])

    def test_small_raster_zoom_policy_matches_gdal_available_levels(self):
        from pipeline.fim1d.depth_pmtiles import _minimum_tile_zoom

        for width, height, maximum, expected in [
            (512, 256, 11, 9),
            (256, 256, 11, 10),
            (1024, 1024, 11, 8),
            (8192, 4096, 14, 9),
            (1, 1, 0, 0),
        ]:
            self.assertEqual(_minimum_tile_zoom(width, height, maximum), expected)
