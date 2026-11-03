"""The native publication backend must not trust a matching version alone."""

import hashlib
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline.common import terrio_runtime
from pipeline.common.terrio_runtime import load_lock, platform_key, platform_view, require_terrio

LOCK = Path(__file__).parents[1] / "pipeline/common/terrio-python.lock.json"


def fake_lock(native_name, body, sys_platform, machine):
    return {"schema_version": 2, "source_commit": "reviewed", "version": "0",
            "python_sha256": {},
            "native": {"here": {"sys_platform": sys_platform, "machine": machine,
                                "file": native_name, "sha256": hashlib.sha256(body).hexdigest(),
                                "wheel_platform": "x"},
                       # Another platform's reviewed artifact must never satisfy this one.
                       "elsewhere": {"sys_platform": "elsewhere", "machine": machine,
                                     "file": "_terrio.other.so", "sha256": "0" * 64,
                                     "wheel_platform": "y"}}}


class RuntimePinTests(unittest.TestCase):
    def tearDown(self):
        require_terrio.cache_clear()

    def run_guard(self, root, native_name, lock):
        module = types.SimpleNamespace(__file__=str(root / "__init__.py"))
        native = types.SimpleNamespace(__file__=str(root / native_name))
        with patch.dict("sys.modules", {"terrio": module, "terrio._terrio": native}), patch.object(
            terrio_runtime, "load_lock", return_value=lock
        ), patch.object(terrio_runtime.sys, "platform", "testos"), patch.object(
            terrio_runtime.platform, "machine", return_value="testarch"
        ):
            require_terrio.cache_clear()
            return require_terrio(), module

    def test_matching_and_altered_native_artifact_per_platform(self):
        for native_name, competitor in (("_terrio.pyd", "_terrio.cp313-win_amd64.pyd"),
                                        ("_terrio.abi3.so", "_terrio.cpython-312-x86_64-linux-gnu.so")):
            with self.subTest(native=native_name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / native_name).write_bytes(b"reviewed")
                lock = fake_lock(native_name, b"reviewed", "testos", "testarch")
                got, module = self.run_guard(root, native_name, lock)
                self.assertIs(got, module)
                other = root / competitor
                other.write_bytes(b"unreviewed")
                with self.assertRaisesRegex(RuntimeError, "competing native"):
                    self.run_guard(root, native_name, lock)
                other.unlink()
                (root / native_name).write_bytes(b"wrong")
                with self.assertRaisesRegex(RuntimeError, "does not match"):
                    self.run_guard(root, native_name, lock)

    def test_other_platform_artifact_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "_terrio.other.so").write_bytes(b"reviewed elsewhere")
            lock = fake_lock("_terrio.abi3.so", b"reviewed", "testos", "testarch")
            with self.assertRaisesRegex(RuntimeError, "loaded native binary"):
                self.run_guard(root, "_terrio.other.so", lock)

    def test_unreviewed_platform_fails_closed_with_fallback(self):
        lock = load_lock(LOCK)
        with self.assertRaisesRegex(RuntimeError, "--writer-backend gdal"):
            platform_key(lock, "sunos5", "sparc64")
        with self.assertRaisesRegex(RuntimeError, "--backend gdal"):
            platform_key(lock, "linux", "riscv64")

    def test_committed_lock_selects_one_entry_per_platform(self):
        lock = load_lock(LOCK)
        self.assertEqual(lock["source_commit"], "9c644f4a1729e253f9714813912f54d32e306c38")
        self.assertEqual(platform_key(lock, "win32", "AMD64"), "win_amd64")
        self.assertIn("__init__.py", lock["python_sha256"])
        for key, entry in lock["native"].items():
            self.assertEqual(platform_key(lock, entry["sys_platform"], entry["machine"]), key)
            self.assertTrue(entry["file"].startswith("_terrio") and entry["file"].endswith((".pyd", ".so")))
            self.assertRegex(entry["sha256"], "^[0-9a-f]{64}$")
            view = platform_view(lock, key)
            self.assertEqual(len(view["sha256"]), len(lock["python_sha256"]) + 1)
        self.assertEqual(len({e["sha256"] for e in lock["native"].values()}), len(lock["native"]))

    def test_windows_view_is_the_reviewed_schema_1_object(self):
        # The Windows wheel embeds this object as terrio-source.json; changing its
        # shape would change the identity of an artifact already released.
        view = platform_view(load_lock(LOCK), "win_amd64")
        self.assertEqual(sorted(view), ["platform", "schema_version", "sha256", "source_commit", "version"])
        self.assertEqual(view["schema_version"], 1)
        # SHA256 of terrio-0.6.1+clb9c644f4.1.dist-info/terrio-source.json in the
        # released win_amd64 wheel (c40983634cc8...).
        self.assertEqual(hashlib.sha256(json.dumps(view, sort_keys=True).encode()).hexdigest(),
                         "6de59ec011df857e4090c3a7ef9d4a3ca0a10d1be8bcaec77a9682f9fc23e3fe")

    def test_import_failure_has_fallback_and_cause(self):
        with patch("pipeline.common.terrio_runtime.importlib.import_module", side_effect=ImportError("ABI")):
            with self.assertRaisesRegex(RuntimeError, "--writer-backend gdal") as caught:
                require_terrio()
            self.assertIsInstance(caught.exception.__cause__, ImportError)
