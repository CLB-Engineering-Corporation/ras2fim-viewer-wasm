import json
import tempfile
import unittest
from pathlib import Path

from pipeline.common.terrio_assets import FILES, copy_package, verify_package


class TerrioAssets(unittest.TestCase):
    def test_external_snippet_directory_link_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output, outside = (Path(tmp) / name for name in ("input", "output", "outside"))
            source.mkdir()
            outside.mkdir()
            for name in FILES:
                (source / name).write_text("{}" if name == "package.json" else name)
            copy_package(source, output)
            try:
                (output / "snippets").symlink_to(outside, target_is_directory=True)
            except OSError:
                self.skipTest("directory symlinks are unavailable on this host")
            self.assertTrue(any("escapes package" in e for e in verify_package(output)))

    def test_existing_destination_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "output"
            destination.mkdir()
            (destination / "keep.txt").write_text("prior artifact")
            with self.assertRaisesRegex(ValueError, "must be empty"):
                copy_package(Path(tmp) / "missing-input", destination)
            self.assertEqual((destination / "keep.txt").read_text(), "prior artifact")

    def test_missing_asset_fails_before_packaging(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input"
            source.mkdir()
            with self.assertRaisesRegex(ValueError, "incomplete"):
                copy_package(source, Path(tmp) / "output")
            self.assertFalse((Path(tmp) / "output").exists())

    def test_declarations_notices_snippets_and_hashes_are_shipped(self):
        import hashlib

        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input"
            source.mkdir()
            for name in FILES:
                (source / name).write_text("{}" if name == "package.json" else name)
            (source / "snippets").mkdir()
            (source / "snippets" / "worker.js").write_text("export {}")
            output = Path(tmp) / "output"
            copy_package(source, output)
            evidence = json.loads((output / "provenance.json").read_text())
            self.assertIn("snippets/worker.js", evidence["sha256"])
            for name, expected in evidence["sha256"].items():
                self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), expected)

    def test_node_package_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input"
            source.mkdir()
            for name in FILES:
                (source / name).write_text(
                    "{}" if name == "package.json" else "module.exports = {}"
                )
            with self.assertRaisesRegex(ValueError, "web module"):
                copy_package(source, Path(tmp) / "output")

    def test_verifier_rejects_missing_hashes_unsafe_paths_and_invalid_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input"
            source.mkdir()
            for name in FILES:
                (source / name).write_text("{}" if name == "package.json" else name)
            output = Path(tmp) / "output"
            copy_package(source, output)
            self.assertEqual(verify_package(output), [])
            manifest = output / "provenance.json"
            original = manifest.read_text()
            for case in (
                "empty",
                "missing-wasm",
                "missing-snippet",
                "parent",
                "absolute",
                "windows",
                "schema",
                "json",
                "hash",
            ):
                with self.subTest(case=case):
                    evidence = json.loads(original)
                    if case == "empty":
                        evidence["sha256"] = {}
                    elif case == "missing-wasm":
                        del evidence["sha256"]["terrio_bg.wasm"]
                    elif case == "missing-snippet":
                        (output / "snippets").mkdir(exist_ok=True)
                        (output / "snippets" / "extra.js").write_text("not inventoried")
                    elif case in ("parent", "absolute", "windows"):
                        name = {
                            "parent": "../outside",
                            "absolute": "/outside",
                            "windows": "C:\\outside",
                        }[case]
                        evidence["sha256"][name] = "0" * 64
                    elif case == "schema":
                        evidence["sha256"] = []
                    elif case == "hash":
                        evidence["sha256"]["terrio.js"] = 42
                    manifest.write_text("{broken" if case == "json" else json.dumps(evidence))
                    self.assertTrue(verify_package(output), case)
                    (output / "snippets" / "extra.js").unlink(missing_ok=True)
            manifest.write_text(original)
            (output / "terrio_bg.wasm").write_bytes(b"changed")
            self.assertTrue(any("hash mismatch" in e for e in verify_package(output)))


class LockedAssets(unittest.TestCase):
    def test_default_missing_fails_and_fallback_is_explicit(self):
        import os
        from unittest.mock import patch
        from pipeline.common.terrio_assets import resolve_package
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"TERRIO_ASSET_CACHE": tmp}):
            with self.assertRaisesRegex(ValueError, "No automatic fallback"):
                resolve_package()
            self.assertIsNone(resolve_package(reader_backend="h5wasm"))
            self.assertEqual(resolve_package("local"), Path("local"))
            with self.assertRaises(ValueError):
                resolve_package("local", reader_backend="h5wasm")

    def test_locked_inventory_tamper_and_cache(self):
        import hashlib
        import os
        from unittest.mock import patch
        from pipeline.common import terrio_assets as assets
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source"
            source.mkdir()
            for name in FILES:
                (source / name).write_text("{}" if name == "package.json" else name)
            lock = {"source_commit": "test-pin", "sha256": {
                name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in FILES}}
            with patch.object(assets, "asset_lock", return_value=lock), patch.dict(
                os.environ, {"TERRIO_ASSET_CACHE": str(Path(tmp) / "cache")}
            ):
                self.assertEqual(assets.main(["--package", str(source)]), 0)
                cached = assets.resolve_package()
                self.assertEqual(assets.verify_package(cached), [])
                self.assertEqual(assets.main(["--package", str(source)]), 0)
                for name in FILES:
                    original = (cached / name).read_bytes()
                    (cached / name).write_bytes(b"tampered")
                    with self.assertRaisesRegex(ValueError, "hash mismatch"):
                        assets.resolve_package()
                    (cached / name).unlink()
                    with self.assertRaisesRegex(ValueError, "missing"):
                        assets.resolve_package()
                    (cached / name).write_bytes(original)
                (cached / "extra.js").write_text("unlocked")
                with self.assertRaisesRegex(ValueError, "unlocked"):
                    assets.resolve_package()

    def test_site_default_contract(self):
        import ast
        source = Path(__file__).parents[1] / "pipeline/fim2d/site.py"
        tree = ast.parse(source.read_text())
        build = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "build")
        defaults = dict(zip((a.arg for a in build.args.kwonlyargs), build.args.kw_defaults))
        self.assertEqual(ast.literal_eval(defaults["reader_backend"]), "terrio")
