import email
import base64
import csv
import hashlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.build_terrio_wheel import build


class ReviewedWheelTests(unittest.TestCase):
    def test_byte_preservation_record_licenses_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "package"
            package.mkdir()
            (package / "_terrio.pyd").write_bytes(b"reviewed binary")
            for name in ("LICENSE", "NOTICE", "LICENSE-THIRD-PARTY.md"):
                (root / name).write_text(name)
            lock = {"platform": "win_amd64", "version": "0.6.1", "source_commit": "a" * 40,
                    "sha256": {"_terrio.pyd": hashlib.sha256(b"reviewed binary").hexdigest()}}
            a = build(package, root, root / "a", lock)
            b = build(package, root, root / "b", lock)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with zipfile.ZipFile(a) as archive:
                self.assertEqual(archive.read("terrio/_terrio.pyd"), b"reviewed binary")
                record = next(n for n in archive.namelist() if n.endswith("/RECORD"))
                for name, digest, size in csv.reader(io.StringIO(archive.read(record).decode())):
                    if name == record:
                        continue
                    body = archive.read(name)
                    self.assertEqual(int(size), len(body))
                    self.assertEqual(digest, "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(body).digest()).decode().rstrip("="))
                self.assertEqual(sum("/licenses/" in n for n in archive.namelist()), 3)
                metadata = next(n for n in archive.namelist() if n.endswith("/METADATA"))
                fields = email.message_from_bytes(archive.read(metadata))
                for declared in fields.get_all("License-File"):
                    self.assertIn(metadata.rsplit("/", 1)[0] + "/licenses/" + declared, archive.namelist())
            (package / "_terrio.pyd").write_bytes(b"wrong binary")
            with self.assertRaisesRegex(ValueError, "artifact mismatch"):
                build(package, root, root / "c", lock)
