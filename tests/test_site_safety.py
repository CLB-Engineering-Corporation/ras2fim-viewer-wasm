"""The site builder's refusals, and the contract that keeps it honest.

Two of these guard published code. ``--clean`` reaches ``shutil.rmtree`` on the
output directory, so a layout where the output contains the source deletes the
input; and ``VIEWER_FILES`` is the highest-risk line in the repository, because
omitting a file from it builds cleanly and 404s only in a browser.

Needs ``netCDF4`` (importing the builder pulls in the manifest module) but not
GDAL. See tests/README.md.
"""

from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path, PurePosixPath

from pipeline.fim2d import site


class SafeLayoutTest(unittest.TestCase):
    """``--out`` is deleted and rebuilt, so overlap with an input is fatal."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fim-safety-"))
        self.source = self.tmp / "source"
        self.viewer = self.tmp / "viewer"
        self.vendor = self.viewer / "vendor"
        for path in (self.source, self.viewer, self.vendor):
            path.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _refuses(self, out: Path) -> str:
        with self.assertRaises(SystemExit) as caught:
            site._assert_safe_layout(self.source, out, self.viewer, self.vendor)
        return str(caught.exception)

    def test_a_disjoint_layout_is_allowed(self):
        site._assert_safe_layout(self.source, self.tmp / "out", self.viewer, self.vendor)

    def test_output_equal_to_source_refuses(self):
        self.assertIn("overlap", self._refuses(self.source))

    def test_output_inside_source_refuses(self):
        # Also poisons the next scan: the build's own results become inputs.
        self.assertIn("overlap", self._refuses(self.source / "site"))

    def test_source_inside_output_refuses(self):
        self.assertIn("overlap", self._refuses(self.tmp))

    def test_output_containing_the_viewer_refuses(self):
        message = self._refuses(self.viewer)
        self.assertIn("viewer", message)

    def test_output_containing_the_vendor_directory_refuses(self):
        # The vendor directory is not tracked; deleting it costs a re-fetch that
        # is not obvious from the error you would otherwise get.
        deep = self.tmp / "deep"
        deep.mkdir()
        nested_vendor = deep / "vendor"
        nested_vendor.mkdir()
        with self.assertRaises(SystemExit) as caught:
            site._assert_safe_layout(self.source, deep, self.viewer, nested_vendor)
        self.assertIn("vendor", str(caught.exception))

    def test_filesystem_root_refuses(self):
        root = Path(self.tmp.anchor or "/")
        with self.assertRaises(SystemExit):
            site._assert_safe_layout(self.source, root, self.viewer, self.vendor)

    def test_relative_paths_are_resolved_before_comparison(self):
        # ``--out source/../source`` is the same directory spelled differently.
        sneaky = self.source / ".." / self.source.name
        self.assertIn("overlap", self._refuses(sneaky))


class ViewerFilesContractTest(unittest.TestCase):
    """Every file the viewer loads at runtime must be in ``VIEWER_FILES``.

    This is the failure mode the contract exists for: a build that succeeds,
    passes a glance, and 404s the worker only once someone opens the page.
    """

    VIEWER = Path(__file__).resolve().parent.parent / "src" / "viewer-2d"

    def _referenced_scripts(self) -> set[str]:
        found: set[str] = set()
        patterns = (
            re.compile(r"""new\s+Worker\(\s*["']([^"']+)["']"""),
            re.compile(r"""importScripts\(([^)]*)\)"""),
            re.compile(r"""<script[^>]+src\s*=\s*["']([^"']+)["']"""),
        )
        for path in self.VIEWER.glob("*"):
            if path.suffix not in (".js", ".html"):
                continue
            text = path.read_text(encoding="utf-8")
            for match in patterns[0].finditer(text):
                found.add(match.group(1))
            for match in patterns[1].finditer(text):
                found.update(re.findall(r"""["']([^"']+)["']""", match.group(1)))
            for match in patterns[2].finditer(text):
                found.add(match.group(1))
        return found

    def test_every_referenced_script_is_published(self):
        references = self._referenced_scripts()
        # A regex-driven test passes vacuously the moment the regex stops
        # matching, which is precisely when it is needed. Pin what it must find.
        self.assertIn("netcdf-worker.js", references,
                      "the scan found no reference to the worker; the patterns have drifted")
        self.assertGreaterEqual(len(references), 4, f"suspiciously few references: {references}")

        published = set(site.VIEWER_FILES) | {f"vendor/{n}" for n in site.VENDOR_FILES}
        for reference in references:
            if reference.startswith(("http://", "https://", "//", "data:")):
                continue
            name = reference.lstrip("./")
            self.assertIn(
                name, published,
                f"{name} is loaded by the viewer but is not in VIEWER_FILES or "
                f"VENDOR_FILES; the built site would 404 it at runtime")

    def test_the_worker_is_listed(self):
        # Named explicitly because it is the one that was actually missed, and
        # because a regex-driven test can only fail if the regex still matches.
        self.assertIn("netcdf-worker.js", site.VIEWER_FILES)

    def test_every_listed_file_exists_in_the_source_viewer(self):
        for name in site.VIEWER_FILES:
            self.assertTrue((self.VIEWER / name).is_file(), f"{name} is listed but absent")


class RepoRootTest(unittest.TestCase):
    def test_repo_root_finds_the_viewer(self):
        # _repo_root() is parent.parent.parent from pipeline/fim2d/site.py. The
        # R2 restructure added a directory level; this is what would have caught
        # it silently resolving one level too high.
        root = site._repo_root()
        self.assertTrue((root / "src" / "viewer-2d").is_dir(), f"bad repo root: {root}")
        self.assertTrue((root / "pipeline" / "fim2d" / "site.py").is_file())


if __name__ == "__main__":
    unittest.main()
