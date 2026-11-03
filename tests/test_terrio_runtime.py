"""The native publication backend must not trust a matching version alone."""

import hashlib
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from pipeline.common.terrio_runtime import require_terrio


class RuntimePinTests(unittest.TestCase):
    def tearDown(self):
        require_terrio.cache_clear()

    def test_matching_and_altered_native_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "_terrio.pyd").write_bytes(b"reviewed")
            module = types.SimpleNamespace(__file__=str(root / "__init__.py"))
            lock = {"source_commit": "reviewed", "sha256": {
                "_terrio.pyd": hashlib.sha256(b"reviewed").hexdigest()}}
            with patch.dict("sys.modules", {"terrio": module, "terrio._terrio": types.SimpleNamespace(__file__=str(root / "_terrio.pyd"))}), patch(
                "pipeline.common.terrio_runtime.json.loads", return_value=lock
            ):
                self.assertIs(require_terrio(), module)
                require_terrio.cache_clear()
                other = root / "_terrio.cp313-win_amd64.pyd"
                other.write_bytes(b"unreviewed")
                with self.assertRaisesRegex(RuntimeError, "competing native"):
                    require_terrio()
                other.unlink()
                (root / "_terrio.pyd").write_bytes(b"wrong")
                with self.assertRaisesRegex(RuntimeError, "does not match"):
                    require_terrio()

    def test_lock_contains_native_binary_and_source(self):
        lock = json.loads((Path(__file__).parents[1] / "pipeline/common/terrio-python.lock.json").read_text())
        self.assertEqual(lock["source_commit"], "9c644f4a1729e253f9714813912f54d32e306c38")
        self.assertIn("_terrio.pyd", lock["sha256"])
        self.assertIn("__init__.py", lock["sha256"])

    def test_import_failure_has_fallback_and_cause(self):
        with patch("pipeline.common.terrio_runtime.importlib.import_module", side_effect=ImportError("ABI")):
            with self.assertRaisesRegex(RuntimeError, "--writer-backend gdal") as caught:
                require_terrio()
            self.assertIsInstance(caught.exception.__cause__, ImportError)
