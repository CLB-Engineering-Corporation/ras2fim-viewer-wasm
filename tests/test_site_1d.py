"""Building a publishable 1D release, and refusing to build a broken one.

The two failures that matter here both ship silently:

* an output directory overlapping an input, which is deleted and rebuilt;
* a release that still needs a tile service, published to hosting that cannot
  run one -- the page loads, the panel fills in, and the depth grid never
  appears.

Stdlib only. No GDAL, no network, no real COGs: the builder copies files the
manifest names, so a fixture of empty files with the right names exercises every
decision it makes.
"""

from __future__ import annotations

import io
import json
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from pipeline.fim1d import site


def make_viewer(root: Path, *, baked: bool = True, profiles: int = 3) -> dict:
    """A minimal 1D viewer tree the builder will accept."""
    root.mkdir(parents=True, exist_ok=True)
    for name in site.VIEWER_FILES:
        (root / name).write_text(f"/* {name} */\n", encoding="utf-8")
    vendor = root / "vendor"
    (vendor / "fonts").mkdir(parents=True, exist_ok=True)
    for name in site.VENDOR_FILES:
        (vendor / name).write_text(f"/* {name} */\n", encoding="utf-8")
    (vendor / "fonts" / "Open Sans Regular").write_text("stub", encoding="utf-8")

    (root / "pmtiles").mkdir(parents=True, exist_ok=True)
    (root / "pmtiles" / "fim_unit.pmtiles").write_bytes(b"PMTiles\x03" + b"\0" * 119)

    entries = []
    for index in range(profiles):
        entry = {"index": index, "label": f"flow{index}_ft", "depth_max_ft": 5.0 + index}
        cog = Path("cogs") / "unit" / "model" / f"depth_{index:03d}.tif"
        (root / cog).parent.mkdir(parents=True, exist_ok=True)
        (root / cog).write_bytes(b"II*\0fake cog")
        entry["cog"] = cog.as_posix()
        entry["bytes"] = (root / cog).stat().st_size
        if baked:
            tiles = Path("pmtiles") / "depth" / "unit" / "model" / f"depth_{index:03d}.pmtiles"
            (root / tiles).parent.mkdir(parents=True, exist_ok=True)
            (root / tiles).write_bytes(b"PMTiles\x03" + b"\0" * 119)
            entry["depth_pmtiles"] = tiles.as_posix()
            entry["depth_pmtiles_bytes"] = (root / tiles).stat().st_size
        entries.append(entry)

    manifest = {
        "schema_version": 1,
        "bbox": [-97.3, 29.9, -97.1, 30.2],
        "units": [{
            "unit": "unit",
            "pmtiles": "pmtiles/fim_unit.pmtiles",
            "models": [{
                "slug": "model",
                "fim": {"depth_max_ft": 5.0 + profiles - 1,
                        "profile_count": profiles,
                        "profiles": entries},
            }],
        }],
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    return manifest


class SafeLayoutTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fim1d-safety-"))
        self.source = self.tmp / "viewer"
        make_viewer(self.source)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _refuses(self, out: Path) -> str:
        with self.assertRaises(site.SiteError) as caught:
            site._assert_safe_layout(self.source, out)
        return str(caught.exception)

    def test_a_disjoint_layout_is_allowed(self):
        site._assert_safe_layout(self.source, self.tmp / "out")

    def test_output_equal_to_source_refuses(self):
        self.assertIn("overlap", self._refuses(self.source))

    def test_output_inside_source_refuses(self):
        self.assertIn("overlap", self._refuses(self.source / "site"))

    def test_source_inside_output_refuses(self):
        self.assertIn("overlap", self._refuses(self.tmp))

    def test_filesystem_root_refuses(self):
        with self.assertRaises(site.SiteError):
            site._assert_safe_layout(self.source, Path(self.tmp.anchor or "/"))

    def test_relative_spelling_is_resolved_first(self):
        self.assertIn("overlap", self._refuses(self.source / ".." / self.source.name))


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fim1d-build-"))
        self.source = self.tmp / "viewer"
        self.out = self.tmp / "site"
        self.manifest = make_viewer(self.source)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _build(self, **kwargs):
        with redirect_stdout(io.StringIO()):
            return site.build(self.source, self.out, **kwargs)

    def test_a_baked_release_builds_and_is_self_contained(self):
        report = self._build()
        self.assertTrue(report["self_contained"])
        self.assertTrue((self.out / "index.html").is_file())
        self.assertTrue((self.out / "vendor" / "pmtiles.js").is_file())
        self.assertTrue((self.out / "vendor" / "fonts" / "Open Sans Regular").is_file())
        self.assertTrue((self.out / ".nojekyll").is_file())

    def test_cogs_are_not_published_and_the_manifest_stops_naming_them(self):
        # A manifest that points at files the release does not carry is a broken
        # contract, not a harmless leftover.
        self._build()
        self.assertEqual(list(self.out.rglob("*.tif")), [])
        published = json.loads((self.out / "manifest.json").read_text("utf-8"))
        for profile in published["units"][0]["models"][0]["fim"]["profiles"]:
            self.assertNotIn("cog", profile)
            self.assertIn("depth_pmtiles", profile)
        self.assertEqual(published["depth_delivery"], "pmtiles")

    def test_every_named_file_is_present_in_the_output(self):
        self._build()
        published = json.loads((self.out / "manifest.json").read_text("utf-8"))
        for unit in published["units"]:
            self.assertTrue((self.out / unit["pmtiles"]).is_file())
            for model in unit["models"]:
                for profile in model["fim"]["profiles"]:
                    self.assertTrue((self.out / profile["depth_pmtiles"]).is_file())

    def test_generated_config_has_no_tile_service(self):
        # The failure this prevents: a published page carrying a developer's
        # loopback tile server, which is useless to every visitor.
        self._build()
        config = (self.out / "config.js").read_text("utf-8")
        self.assertIn("rasterTileBase: null", config)
        self.assertNotIn("localhost", config)
        self.assertNotIn("127.0.0.1", config)

    def test_generated_config_centres_on_the_data(self):
        self._build()
        config = (self.out / "config.js").read_text("utf-8")
        self.assertIn("-97.2", config)

    def test_an_unbaked_release_refuses_by_default(self):
        shutil.rmtree(self.source)
        make_viewer(self.source, baked=False)
        with self.assertRaises(site.SiteError) as caught:
            self._build()
        message = str(caught.exception)
        self.assertIn("no baked depth tiles", message)
        self.assertIn("depth_pmtiles", message)

    def test_an_unbaked_release_can_be_published_deliberately(self):
        shutil.rmtree(self.source)
        make_viewer(self.source, baked=False)
        report = self._build(require_baked=False,
                             raster_tile_base="https://tiles.example.org/fim")
        self.assertFalse(report["self_contained"])
        config = (self.out / "config.js").read_text("utf-8")
        self.assertIn("tiles.example.org", config)
        # With a tile service the COGs stay, because that is what it reads.
        published = json.loads((self.out / "manifest.json").read_text("utf-8"))
        self.assertIn("cog", published["units"][0]["models"][0]["fim"]["profiles"][0])

    def test_a_manifest_naming_a_missing_file_refuses(self):
        (self.source / "pmtiles" / "depth" / "unit" / "model" / "depth_001.pmtiles").unlink()
        with self.assertRaises(site.SiteError) as caught:
            self._build()
        self.assertIn("not present", str(caught.exception))

    def test_rebuilding_drops_files_that_are_no_longer_listed(self):
        # Building in place would leave the stale copy for the manifest to pick
        # straight back up. The builder stages and replaces for this reason.
        self._build()
        stray = self.out / "pmtiles" / "depth" / "unit" / "model" / "depth_099.pmtiles"
        stray.write_bytes(b"stale")
        self._build()
        self.assertFalse(stray.exists())

    def test_no_manifest_is_a_clear_failure(self):
        (self.source / "manifest.json").unlink()
        with self.assertRaises(site.SiteError) as caught:
            self._build()
        self.assertIn("manifest", str(caught.exception))

    def test_a_missing_viewer_file_refuses(self):
        (self.source / "app.js").unlink()
        with self.assertRaises(site.SiteError) as caught:
            self._build()
        self.assertIn("app.js", str(caught.exception))

    def test_a_missing_vendor_library_refuses(self):
        (self.source / "vendor" / "pmtiles.js").unlink()
        with self.assertRaises(site.SiteError) as caught:
            self._build()
        self.assertIn("pmtiles.js", str(caught.exception))


class ViewerFilesContractTest(unittest.TestCase):
    """The 1D half of the contract that 404s only in a browser."""

    VIEWER = Path(site.__file__).resolve().parent.parent.parent / "src" / "viewer-1d"

    def test_every_listed_file_exists(self):
        for name in site.VIEWER_FILES:
            self.assertTrue((self.VIEWER / name).is_file(), f"{name} is listed but absent")

    def test_index_html_references_nothing_unpublished(self):
        import re

        html = (self.VIEWER / "index.html").read_text(encoding="utf-8")
        published = (set(site.VIEWER_FILES) | set(site.GENERATED_FILES)
                     | {f"vendor/{n}" for n in site.VENDOR_FILES})
        references = set(re.findall(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", html))
        self.assertGreaterEqual(len(references), 4, f"scan found too little: {references}")
        for reference in references:
            if reference.startswith(("http://", "https://", "//", "data:", "#")):
                continue
            self.assertIn(reference.lstrip("./"), published,
                          f"{reference} is loaded by the page but the release does not carry it")

    def test_config_is_generated_not_copied(self):
        # config.js is the one file that must differ between a preview and a
        # publication; copying it would ship a loopback tile server.
        self.assertNotIn("config.js", site.VIEWER_FILES)
        self.assertIn("config.js", site.GENERATED_FILES)


if __name__ == "__main__":
    unittest.main()
