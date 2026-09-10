"""Build a site from synthesised NetCDF and validate it, end to end.

This is the only test that runs the 2D pipeline as a user runs it. Everything
else checks a function; this checks that the pieces still fit -- that the
manifest the builder writes is the manifest the validator expects, and that both
still agree with the viewer's schema constant.

Fixtures are written to a temporary directory and are a few kilobytes each. See
tests/fixture_nc.py for why they are synthesised rather than committed.

Needs ``netCDF4`` and ``numpy``, but not GDAL.
"""

from __future__ import annotations

import io
import json
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from pipeline.fim2d import manifest as manifest_builder
from pipeline.fim2d import site
from pipeline.fim2d import validate as validator

from . import fixture_nc


def temp_viewer_root(parent: Path) -> Path:
    """A viewer source directory the build can use without touching the network.

    ``_ensure_vendor()`` runs ``fetch-vendor.sh`` when a vendor library is
    missing, which downloads 6.9 MB of h5wasm and MapLibre. That is right for a
    real build and wrong for a test: it makes the suite depend on two CDNs, and
    it fails on any checkout that has not vendored yet -- which is every CI run.

    So the real viewer files are copied into a temporary root beside stub vendor
    files, and the build is pointed at that. The stubs are never executed; the
    build only copies them. What is under test is the pipeline's own logic.

    That the *real* ``src/viewer-2d`` root resolves and holds every file in
    ``VIEWER_FILES`` is asserted in ``test_site_safety.py``, so nothing is lost.
    """
    root = parent / "viewer"
    (root / "vendor").mkdir(parents=True, exist_ok=True)
    real = Path(site.__file__).resolve().parent.parent.parent / "src" / "viewer-2d"
    for name in site.VIEWER_FILES:
        shutil.copy2(real / name, root / name)
    for name in site.VENDOR_FILES:
        (root / "vendor" / name).write_text(
            f"/* test stub for {name}; the build copies it and never runs it */\n",
            encoding="utf-8")
    return root


class RoundTripTest(unittest.TestCase):
    """One source tree containing everything the builder must handle."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="fim-roundtrip-"))
        cls.viewer = temp_viewer_root(cls.tmp)
        cls.source = cls.tmp / "source"
        # Two models sharing a basename in different directories. A flat
        # data/<basename> layout silently publishes one and loses the other.
        fixture_nc.write_stack(cls.source / "modelA" / "reach.nc", stream_id="wb-1000001")
        fixture_nc.write_stack(cls.source / "modelB" / "reach.nc", stream_id="wb-1000002")
        # The depth branch, which had no real sample and was wrong for a while.
        fixture_nc.write_stack(cls.source / "depth" / "reach-depth.nc",
                               stream_id="wb-1000003", variable="depth")
        # Must be skipped, not copied-and-unlisted.
        fixture_nc.write_not_a_stack(cls.source / "unrelated.nc")

        cls.out = cls.tmp / "site"
        cls.build_log = io.StringIO()
        with redirect_stdout(cls.build_log):
            code = site.build(cls.source, cls.out, viewer_root=str(cls.viewer),
                              title="round-trip fixture", attribution=None,
                              data_base_url=None)
        assert code == 0, cls.build_log.getvalue()
        cls.manifest = json.loads((cls.out / "manifest.json").read_text("utf-8"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_deep_validation_passes(self):
        log = io.StringIO()
        with redirect_stdout(log):
            code = validator.main([str(self.out), "--deep"])
        self.assertEqual(code, 0, log.getvalue())
        self.assertIn("PASS", log.getvalue())

    def test_all_three_stacks_are_published(self):
        ids = sorted(s["id"] for s in self.manifest["streams"])
        self.assertEqual(ids, ["wb-1000001", "wb-1000002", "wb-1000003"])

    def test_duplicate_basenames_do_not_collapse(self):
        files = sorted(s["file"] for s in self.manifest["streams"])
        self.assertEqual(len(set(files)), 3, f"basenames collapsed: {files}")
        for entry in self.manifest["streams"]:
            self.assertTrue((self.out / entry["file"]).is_file(),
                            f"manifest lists {entry['file']} but it was not copied")

    def test_a_rejected_file_is_not_left_downloadable(self):
        # Present but unlisted is the worst of both: invisible in the picker and
        # publicly fetchable. The inventory is selected before anything is copied.
        published = {p.name for p in self.out.rglob("*.nc")}
        self.assertNotIn("unrelated.nc", published)
        self.assertIn("skip", self.build_log.getvalue())

    def test_the_worker_reached_the_output(self):
        for name in site.VIEWER_FILES:
            self.assertTrue((self.out / name).is_file(), f"{name} missing from the built site")
        self.assertTrue((self.out / ".nojekyll").is_file())

    def test_manifest_schema_matches_what_the_validator_expects(self):
        self.assertEqual(self.manifest["schema_version"], validator.EXPECTED_SCHEMA)

    def test_manifest_is_strict_json(self):
        # allow_nan=False on the way out; this is the reader on the way back in.
        # A bare NaN parses in Python and throws in the browser at JSON.parse.
        text = (self.out / "manifest.json").read_text("utf-8")
        for token in ("NaN", "Infinity"):
            self.assertNotIn(token, text)

    def test_bounds_are_lonlat_in_the_right_hemisphere(self):
        for entry in self.manifest["streams"]:
            west, south, east, north = entry["bounds"]
            self.assertLess(west, east)
            self.assertLess(south, north)
            self.assertTrue(-130 < west < -60, f"{entry['id']}: longitude {west}")
            self.assertTrue(20 < south < 55, f"{entry['id']}: latitude {south}")

    def test_the_depth_stack_is_labelled_depth(self):
        entry = next(s for s in self.manifest["streams"] if s["id"] == "wb-1000003")
        self.assertEqual(entry["mode"], "depth")
        self.assertEqual(entry["variable"], "depth")

    def test_rebuilding_is_deterministic_apart_from_the_timestamp(self):
        second = self.tmp / "site2"
        with redirect_stdout(io.StringIO()):
            site.build(self.source, second, viewer_root=str(self.viewer),
                       title="round-trip fixture", attribution=None, data_base_url=None)
        a = json.loads((self.out / "manifest.json").read_text("utf-8"))
        b = json.loads((second / "manifest.json").read_text("utf-8"))
        for doc in (a, b):
            for key in ("generated", "generated_utc", "built"):
                doc.pop(key, None)
        self.assertEqual(a, b)
        shutil.rmtree(second, ignore_errors=True)


class DescribeRejectionTest(unittest.TestCase):
    """``describe()`` returning None is what keeps unpublishable data out."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fim-describe-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_a_rotated_grid_is_refused(self):
        # The viewer places a raster by its four corners and interpolates
        # linearly between them, which is only correct for an axis-aligned grid.
        # Advertising one it cannot draw is worse than omitting it.
        path = fixture_nc.write_stack(self.tmp / "rotated.nc", rotated=True)
        self.assertIsNone(manifest_builder.describe(path, self.tmp))

    def test_a_non_stack_is_refused(self):
        path = fixture_nc.write_not_a_stack(self.tmp / "temperature.nc")
        self.assertIsNone(manifest_builder.describe(path, self.tmp))

    def test_a_valid_stack_is_accepted(self):
        path = fixture_nc.write_stack(self.tmp / "ok.nc")
        described = manifest_builder.describe(path, self.tmp)
        self.assertIsNotNone(described)
        self.assertEqual(described["variable"], "wsel")
        self.assertEqual(described["grid"]["cell_size_m"], fixture_nc.CELL_M)

    def test_non_integer_flows_are_not_truncated(self):
        # F-15: int() turned 1.75 into 1 and mislabelled the slider with a
        # discharge the model never ran.
        path = fixture_nc.write_stack(self.tmp / "fractional.nc", flows=(1.75, 2.5, 10.0))
        described = manifest_builder.describe(path, self.tmp)
        self.assertEqual(described["flow_range"], [1.75, 10])

    def test_an_empty_source_is_a_clear_failure(self):
        empty = self.tmp / "empty"
        empty.mkdir()
        with self.assertRaises(SystemExit) as caught:
            site._select_inventory(empty)
        self.assertIn("no .nc files", str(caught.exception))

    def test_relative_paths_survive_inventory_selection(self):
        fixture_nc.write_stack(self.tmp / "a" / "same.nc", stream_id="wb-1")
        fixture_nc.write_stack(self.tmp / "b" / "same.nc", stream_id="wb-2")
        with redirect_stdout(io.StringIO()):
            inventory = site._select_inventory(self.tmp)
        relatives = sorted(str(rel) for _, rel in inventory)
        self.assertEqual(relatives, ["a/same.nc", "b/same.nc"])


if __name__ == "__main__":
    unittest.main()
