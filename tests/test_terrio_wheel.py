import base64
import contextlib
import csv
import email
import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.build_terrio_wheel import build, from_maturin, main

LICENSES = ("LICENSE", "NOTICE", "LICENSE-THIRD-PARTY.md")


def sha(body):
    return hashlib.sha256(body).hexdigest()


def check_record(test, archive):
    record = next(n for n in archive.namelist() if n.endswith("/RECORD"))
    for name, digest, size in csv.reader(io.StringIO(archive.read(record).decode())):
        if name == record:
            continue
        body = archive.read(name)
        test.assertEqual(int(size), len(body))
        test.assertEqual(digest, "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(body).digest()).decode().rstrip("="))
    test.assertEqual(sum("/licenses/" in n for n in archive.namelist()), 3)
    metadata = next(n for n in archive.namelist() if n.endswith("/METADATA"))
    fields = email.message_from_bytes(archive.read(metadata))
    for declared in fields.get_all("License-File"):
        test.assertIn(metadata.rsplit("/", 1)[0] + "/licenses/" + declared, archive.namelist())


class ReviewedWheelTests(unittest.TestCase):
    def test_byte_preservation_record_licenses_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "package"
            package.mkdir()
            (package / "_terrio.pyd").write_bytes(b"reviewed binary")
            for name in LICENSES:
                (root / name).write_text(name)
            lock = {"platform": "win_amd64", "version": "0.6.1", "source_commit": "a" * 40,
                    "sha256": {"_terrio.pyd": hashlib.sha256(b"reviewed binary").hexdigest()}}
            a = build(package, root, root / "a", lock)
            b = build(package, root, root / "b", lock)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with zipfile.ZipFile(a) as archive:
                self.assertEqual(archive.read("terrio/_terrio.pyd"), b"reviewed binary")
                check_record(self, archive)
            (package / "_terrio.pyd").write_bytes(b"wrong binary")
            with self.assertRaisesRegex(ValueError, "artifact mismatch"):
                build(package, root, root / "c", lock)


class FromMaturinTests(unittest.TestCase):
    """A pinned-source CI build is repackaged only if its Python bytes are the reviewed ones."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.python = {"__init__.py": b"import x\r\n", "rio/warp.py": b"def f():\r\n    pass\r\n"}
        self.lock = {"schema_version": 2, "source_commit": "b" * 40, "version": "0.6.1",
                     "python_sha256": {n: sha(b) for n, b in self.python.items()},
                     "native": {}}
        self.licenses = self.root / "licenses"
        self.licenses.mkdir()
        # Reviewed LICENSE is CRLF, the third-party notice LF: a checkout may produce either.
        reviewed = {"LICENSE": b"MIT\r\n", "NOTICE": b"n\r\n", "LICENSE-THIRD-PARTY.md": b"t\n"}
        for name in LICENSES:
            (self.licenses / name).write_bytes(reviewed[name].replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        self.license_sha = {n: sha(b) for n, b in reviewed.items()}
        self.reviewed_licenses = reviewed

    def maturin(self, name="terrio-0.6.1-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
                extra=None, python=None):
        path = self.root / name
        entries = {"terrio/" + n: b for n, b in (python or self.python).items()}
        entries.update({"terrio/_terrio.abi3.so": b"ELF native", "terrio/_terrio.pyi": b"",
                        "terrio/py.typed": b"", "terrio-0.6.1.dist-info/RECORD": b"",
                        "terrio-0.6.1.dist-info/entry_points.txt": b""})
        entries.update(extra or {})
        with zipfile.ZipFile(path, "w") as archive:
            for n, b in entries.items():
                archive.writestr(n, b)
        return path

    def convert(self, built, out="out"):
        return from_maturin(built, self.licenses, self.root / out, self.lock, "linux_x86_64",
                            "linux", "x86_64", self.license_sha)

    def test_reviewed_layout_and_candidate_entry(self):
        wheel, record = self.convert(self.maturin())
        self.assertEqual(wheel.name, "terrio-0.6.1+clbbbbbbbb.1-cp310-abi3-"
                                     "manylinux_2_17_x86_64.manylinux2014_x86_64.whl")
        self.assertEqual(record["native"], {"sys_platform": "linux", "machine": "x86_64",
                                            "file": "_terrio.abi3.so", "sha256": sha(b"ELF native"),
                                            "wheel_platform": "manylinux_2_17_x86_64.manylinux2014_x86_64"})
        self.assertEqual(record["wheel"]["sha256"], sha(wheel.read_bytes()))
        with zipfile.ZipFile(wheel) as archive:
            names = archive.namelist()
            self.assertEqual(sorted(n for n in names if n.startswith("terrio/")),
                             ["terrio/__init__.py", "terrio/_terrio.abi3.so", "terrio/rio/warp.py"])
            for n, body in self.python.items():
                self.assertEqual(archive.read("terrio/" + n), body)
            dist = "terrio-0.6.1+clbbbbbbbb.1.dist-info"
            for n, body in self.reviewed_licenses.items():
                self.assertEqual(archive.read(f"{dist}/licenses/{n}"), body)
            self.assertEqual(archive.read(f"{dist}/WHEEL").decode().splitlines()[-2:],
                             ["Tag: cp310-abi3-manylinux_2_17_x86_64",
                              "Tag: cp310-abi3-manylinux2014_x86_64"])
            source = json.loads(archive.read(f"{dist}/terrio-source.json"))
            self.assertEqual(source["platform"], "linux_x86_64")
            self.assertEqual(source["sha256"]["_terrio.abi3.so"], sha(b"ELF native"))
            check_record(self, archive)
        again, _ = self.convert(self.maturin(), out="again")
        self.assertEqual(again.read_bytes(), wheel.read_bytes())

    def test_python_bytes_must_be_the_reviewed_ones(self):
        lf = {n: b.replace(b"\r\n", b"\n") for n, b in self.python.items()}
        with self.assertRaisesRegex(ValueError, "Python files differ"):
            self.convert(self.maturin(python=lf))
        with self.assertRaisesRegex(ValueError, "inventory differs"):
            self.convert(self.maturin(python={**self.python, "extra.py": b""}))
        self.assertFalse((self.root / "out").exists())

    def test_unexpected_entries_and_tags_refused(self):
        for extra in ({"terrio.libs/libgdal.so": b"x"}, {"terrio/_terrio.cpython-312.so": b"x"},
                      {"terrio/data.bin": b"x"}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.convert(self.maturin(extra=extra))
        with self.assertRaisesRegex(ValueError, "cp310-abi3"):
            self.convert(self.maturin(name="terrio-0.6.1-cp312-cp312-linux_x86_64.whl"))

    def test_license_bytes_must_match_review(self):
        (self.licenses / "NOTICE").write_bytes(b"changed\n")
        with self.assertRaisesRegex(ValueError, "license"):
            self.convert(self.maturin())

    def test_cli_reports_rebuild_against_reviewed_entry(self):
        lock_path, web_path = self.root / "lock.json", self.root / "web.json"
        _, record = self.convert(self.maturin(), out="first")
        # A committed entry also carries review notes; only identity is compared.
        lock = dict(self.lock, native={"linux_x86_64": dict(record["native"], build="reviewed notes")})
        lock_path.write_text(json.dumps(lock))
        web_path.write_text(json.dumps({"sha256": self.license_sha}))
        with contextlib.redirect_stdout(io.StringIO()):
            main(["--lock", str(lock_path), "--web-lock", str(web_path), "from-maturin",
                  str(self.maturin()), str(self.licenses), str(self.root / "cli"),
                  "--platform", "linux_x86_64", "--sys-platform", "linux", "--machine", "x86_64"])
        entry = json.loads((self.root / "cli/linux_x86_64.lock-entry.json").read_text())
        self.assertTrue(entry["matches_reviewed_entry"])
