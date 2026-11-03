"""Wrap the reviewed abi3 Windows binary without recompiling or changing bytes.

This packages an existing artifact, not a new compiler build. The Cargo source
uses pyo3 abi3-py310; the native lock deliberately supports win_amd64 only.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path


def build(package: Path, licenses: Path, output: Path, lock: dict) -> Path:
    if lock["platform"] != "win_amd64":
        raise ValueError("only the reviewed Windows abi3 artifact is supported")
    version = lock["version"] + "+clb" + lock["source_commit"][:7]
    dist = f"terrio-{version}.dist-info"
    entries = {}
    for name, expected in lock["sha256"].items():
        source = (package / name).resolve()
        if not source.is_relative_to(package.resolve()):
            raise ValueError("unsafe package inventory")
        body = source.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise ValueError(f"artifact mismatch: {name}")
        entries["terrio/" + name] = body
    for name in ("LICENSE", "NOTICE", "LICENSE-THIRD-PARTY.md"):
        entries[f"{dist}/licenses/{name}"] = (licenses / name).read_bytes()
    entries[f"{dist}/METADATA"] = (
        f"Metadata-Version: 2.4\nName: terrio\nVersion: {version}\n"
        "Summary: Reviewed CLB Terrio native publication artifact\n"
        "Requires-Python: >=3.10\nRequires-Dist: numpy>=1.21\nRequires-Dist: affine>=2.3\n"
        "License-Expression: MIT AND MPL-2.0\n"
        "License-File: licenses/LICENSE\nLicense-File: licenses/NOTICE\n"
        "License-File: licenses/LICENSE-THIRD-PARTY.md\n\n"
        f"Source commit: {lock['source_commit']}\n"
    ).encode()
    entries[f"{dist}/WHEEL"] = (
        "Wheel-Version: 1.0\nGenerator: clb-reviewed-artifact\n"
        "Root-Is-Purelib: false\nTag: cp310-abi3-win_amd64\n"
    ).encode()
    entries[f"{dist}/terrio-source.json"] = json.dumps(lock, sort_keys=True).encode()
    record = io.StringIO(newline="")
    writer = csv.writer(record, lineterminator="\n")
    for name, body in sorted(entries.items()):
        digest = base64.urlsafe_b64encode(hashlib.sha256(body).digest()).decode().rstrip("=")
        writer.writerow((name, "sha256=" + digest, len(body)))
    writer.writerow((f"{dist}/RECORD", "", ""))
    entries[f"{dist}/RECORD"] = record.getvalue().encode()
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"terrio-{version}-cp310-abi3-win_amd64.whl"
    if target.exists():
        raise FileExistsError(target)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, body in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, body)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("licenses", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    lock = json.loads((Path(__file__).parents[1] / "pipeline/common/terrio-python.lock.json").read_text())
    result = build(args.package, args.licenses, args.output, lock)
    print(result)
    print(hashlib.sha256(result.read_bytes()).hexdigest())
