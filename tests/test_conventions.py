"""The conventions checker, and the property that makes it worth running first.

``pipeline/check_conventions.py`` claims to need nothing installed. CI relies on
that: it runs the checker before building any wheel, so a structural regression
is reported in seconds rather than after a minute of dependency resolution.

That claim rotted once already -- the checker imported the site builders, which
pull in netCDF4 -- and it failed only in CI, where nothing was installed yet.
So it is pinned here rather than trusted.

Stdlib only.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from pipeline import check_conventions

ROOT = Path(check_conventions.__file__).resolve().parent.parent


class RepositoryPassesTest(unittest.TestCase):
    def test_the_repository_satisfies_its_own_conventions(self):
        log = io.StringIO()
        with redirect_stdout(log):
            code = check_conventions.main([str(ROOT)])
        self.assertEqual(code, 0, log.getvalue())
        self.assertIn("PASS", log.getvalue())

    def test_no_rule_claims_enforcement_without_a_check(self):
        # The checker warns rather than fails on this, so the warning has to be
        # asserted somewhere or it is just text nobody reads.
        log = io.StringIO()
        with redirect_stdout(log):
            check_conventions.main([str(ROOT)])
        self.assertNotIn("declared enforced in .conventions.yaml but nothing checks it",
                         log.getvalue())

    def test_every_checked_rule_is_declared(self):
        log = io.StringIO()
        with redirect_stdout(log):
            check_conventions.main([str(ROOT)])
        self.assertNotIn("checked here but not declared", log.getvalue())


class NoDependenciesTest(unittest.TestCase):
    """The checker must run on a checkout with nothing installed."""

    def test_runs_with_netcdf4_numpy_and_gdal_all_unavailable(self):
        with tempfile.TemporaryDirectory(prefix="fim-blocked-") as tmp:
            for module in ("netCDF4", "numpy", "osgeo"):
                Path(tmp, f"{module}.py").write_text(
                    "raise ImportError('blocked: the conventions checker must not need this')\n",
                    encoding="utf-8")
            env = dict(os.environ, PYTHONPATH=tmp)
            env.pop("PYTHONHOME", None)
            result = subprocess.run(
                [sys.executable, "-m", "pipeline.check_conventions"],
                capture_output=True, text=True, env=env, cwd=str(ROOT))
        self.assertEqual(result.returncode, 0,
                         f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}")
        self.assertIn("PASS", result.stdout)

    def test_it_imports_only_the_standard_library(self):
        source = Path(check_conventions.__file__)
        imports = check_conventions._module_level_imports(source)
        allowed = set(sys.stdlib_module_names)
        self.assertTrue(imports <= allowed,
                        f"non-stdlib import(s) at module scope: {sorted(imports - allowed)}")


class ConstantReadingTest(unittest.TestCase):
    """Reading VIEWER_FILES without importing is what removed the dependency."""

    def test_reads_tuples_from_a_module_it_never_imports(self):
        with tempfile.TemporaryDirectory(prefix="fim-const-") as tmp:
            module = Path(tmp, "sample.py")
            module.write_text(
                "import this_module_does_not_exist\n"
                'VIEWER_FILES = ("index.html", "app.js")\n'
                'VENDOR_FILES = ("lib.js",)\n'
                "OTHER = 3\n",
                encoding="utf-8")
            found = check_conventions.module_constants(
                module, ("VIEWER_FILES", "VENDOR_FILES", "GENERATED_FILES"))
        self.assertEqual(found["VIEWER_FILES"], ("index.html", "app.js"))
        self.assertEqual(found["VENDOR_FILES"], ("lib.js",))
        self.assertNotIn("GENERATED_FILES", found)
        self.assertNotIn("OTHER", found)

    def test_a_computed_constant_is_skipped_rather_than_executed(self):
        with tempfile.TemporaryDirectory(prefix="fim-const-") as tmp:
            module = Path(tmp, "sample.py")
            module.write_text("VIEWER_FILES = tuple(open('/etc/passwd'))\n", encoding="utf-8")
            found = check_conventions.module_constants(module, ("VIEWER_FILES",))
        self.assertEqual(found, {})


class CommentStrippingTest(unittest.TestCase):
    """A checker that flags its own documentation gets disabled, not fixed."""

    def test_line_and_block_comments_go(self):
        stripped = check_conventions.strip_js_comments(
            "var a = 1; // setTimeout(fn, 0)\n/* setTimeout(fn, 0) */\nvar b = 2;")
        self.assertNotIn("setTimeout", stripped)
        self.assertIn("var a = 1;", stripped)
        self.assertIn("var b = 2;", stripped)

    def test_a_url_is_not_mistaken_for_a_comment(self):
        stripped = check_conventions.strip_js_comments('var u = "https://example.org/x";')
        self.assertIn("https://example.org/x", stripped)


if __name__ == "__main__":
    unittest.main()
