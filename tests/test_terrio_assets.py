import json
import tempfile
import unittest
from pathlib import Path

from pipeline.common.terrio_assets import FILES, copy_package, verify_package


class TerrioAssets(unittest.TestCase):
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
