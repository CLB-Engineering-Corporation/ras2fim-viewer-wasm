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
    def test_manifest_failure_preserves_previous_and_removes_partial(self):
        from pipeline.fim1d.manifest import _write_manifest

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "manifest.json"
            target.write_text('{"previous":true}', encoding="utf-8")
            with (
                patch("pipeline.fim1d.manifest.os.replace", side_effect=OSError("injected rename")),
                self.assertRaisesRegex(OSError, "injected rename"),
            ):
                _write_manifest(target, {"units": []})
            self.assertEqual(target.read_text(), '{"previous":true}')
            self.assertEqual(list(Path(tmp).glob("*.partial")), [])

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

    def test_all_dry_writes_valid_empty_archive_without_cli(self):
        from pipeline.fim1d import depth_pmtiles as module

        try:
            from pmtiles.reader import Reader, all_tiles
        except ImportError:
            self.skipTest("requires declared pmtiles dependency")
        from osgeo import osr

        with tempfile.TemporaryDirectory() as tmp:
            cog = Path(tmp) / "dry.tif"
            ds = gdal.GetDriverByName("GTiff").Create(str(cog), 8, 8, 1, gdal.GDT_Float32)
            ds.SetGeoTransform((500000, 1, 0, 4100000, 0, -1))
            srs = osr.SpatialReference()
            srs.ImportFromEPSG(3857)
            ds.SetProjection(srs.ExportToWkt())
            ds.GetRasterBand(1).Fill(0)
            ds = None
            target = Path(tmp) / "good.pmtiles"
            target.write_bytes(b"prior archive")
            with patch.object(
                module, "_require_pmtiles_cli", side_effect=AssertionError("unneeded CLI")
            ):
                for backend in ("gdal", "terrio"):
                    report = module.build_profile(cog, target, 0, backend=backend)
                    self.assertTrue(report["empty"])
                    data = target.read_bytes()
                    reader = Reader(lambda offset, length, data=data: data[offset : offset + length])
                    self.assertEqual(reader.header()["addressed_tiles_count"], 1)
                    self.assertEqual(len(list(all_tiles(reader.get_bytes))), 1)
                    self.assertTrue(reader.get(0, 0, 0).startswith(b"\x89PNG\r\n\x1a\n"))
                    self.assertIsNone(reader.get(1, 0, 0))
                    self.assertTrue(reader.metadata()["empty"])
                    from pipeline.common.empty_tiles import validate_empty_archive
                    from pipeline.fim1d.validate import Report, _validate_pmtiles_archive
                    validate_empty_archive(target)
                    validation = Report()
                    _validate_pmtiles_archive(target, "dry", validation, expect_empty=True)
                    self.assertEqual(validation.failures, [])
                    self.assertEqual(validation.warnings, [])
                    undeclared = Report()
                    _validate_pmtiles_archive(target, "undeclared dry", undeclared)
                    self.assertTrue(undeclared.failures)
                    from pipeline.fim1d import site
                    stale = {"units": [{"models": [{"fim": {"profiles": [{
                        "depth_pmtiles": target.name, "depth_max_ft": 5,
                    }]}}]}]}
                    with self.assertRaisesRegex(site.SiteError, "not declared"):
                        site.select_inventory(Path(tmp), stale, require_baked=True)
                    png = Path(tmp) / "transparent.png"
                    png.write_bytes(reader.get(0, 0, 0))
                    image = gdal.Open(str(png))
                    self.assertEqual(image.GetRasterBand(4).ReadRaster(), b"\x00")
                    image = None
                    for index in (100, len(data) - 1):
                        corrupt = bytearray(data)
                        corrupt[index] ^= 1
                        target.write_bytes(corrupt)
                        validation = Report()
                        _validate_pmtiles_archive(target, "corrupt", validation, expect_empty=True)
                        self.assertTrue(validation.failures)

    def test_empty_writer_failure_preserves_previous_archive(self):
        from pipeline.fim1d import depth_pmtiles as module

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "good.pmtiles"
            target.write_bytes(b"prior archive")

            def fail(_rgba, partial, _name):
                partial.write_bytes(b"partial")
                raise RuntimeError("injected empty writer failure")

            with (
                patch.object(module, "colourise", return_value=0),
                patch.object(module, "_write_empty_archive", side_effect=fail),
                self.assertRaisesRegex(RuntimeError, "injected empty writer"),
            ):
                module.build_profile(Path("unused.tif"), target, 0, backend="terrio")
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
