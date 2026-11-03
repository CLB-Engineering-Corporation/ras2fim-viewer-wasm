"""Wrap a reviewed Terrio native extension into a deterministic abi3 wheel.

Two modes, one packager:

* ``wrap`` (the original Windows path) packages an existing reviewed artifact
  directory without recompiling or changing bytes.
* ``from-maturin`` takes a wheel maturin built from the pinned source on a CI
  runner, proves its Python files are byte-identical to the locked inventory,
  extracts its single native extension and repackages it with exactly the same
  layout, metadata and license bytes as the reviewed Windows wheel. It emits a
  candidate lock entry; nothing is trusted until that entry is reviewed and
  committed to ``pipeline/common/terrio-python.lock.json``.

The Cargo source uses PyO3 ``abi3-py310``. Python and license bytes are the
reviewed ones on every platform; only the native extension differs.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline.common.terrio_runtime import load_lock, platform_view  # noqa: E402

LICENSES = ("LICENSE", "NOTICE", "LICENSE-THIRD-PARTY.md")
REVISION = ".1"


def sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def wheel_version(lock: dict) -> str:
    return lock["version"] + "+clb" + lock["source_commit"][:7] + REVISION


def reviewed_license(path: Path, expected: str | None) -> bytes:
    """The reviewed license bytes, whichever line-ending form a checkout produced."""
    body = path.read_bytes()
    if expected is None:
        return body
    lf = body.replace(b"\r\n", b"\n")
    for candidate in (body, lf, lf.replace(b"\n", b"\r\n")):
        if sha256(candidate) == expected:
            return candidate
    raise ValueError(f"license does not match the reviewed bytes: {path.name}")


def build(package: Path, licenses: Path, output: Path, lock: dict,
          wheel_platform: str | None = None, license_sha256: dict | None = None) -> Path:
    """``lock`` is a single-platform (schema 1) inventory, as from ``platform_view``."""
    wheel_platform = wheel_platform or lock["platform"]
    platforms = wheel_platform.split(".")
    if not all(re.fullmatch(r"[a-z0-9_]+", p) for p in platforms):
        raise ValueError(f"invalid wheel platform tag: {wheel_platform}")
    version = wheel_version(lock)
    dist = f"terrio-{version}.dist-info"
    entries = {}
    for name, expected in lock["sha256"].items():
        source = (package / name).resolve()
        if not source.is_relative_to(package.resolve()):
            raise ValueError("unsafe package inventory")
        body = source.read_bytes()
        if sha256(body) != expected:
            raise ValueError(f"artifact mismatch: {name}")
        entries["terrio/" + name] = body
    for name in LICENSES:
        expected = None if license_sha256 is None else license_sha256[name]
        entries[f"{dist}/licenses/{name}"] = reviewed_license(licenses / name, expected)
    entries[f"{dist}/METADATA"] = (
        f"Metadata-Version: 2.4\nName: terrio\nVersion: {version}\n"
        "Summary: Reviewed CLB Terrio native publication artifact\n"
        "Requires-Python: >=3.10\nRequires-Dist: numpy>=1.21\nRequires-Dist: affine>=2.3\n"
        "License-Expression: MIT AND MPL-2.0\n"
        "License-File: LICENSE\nLicense-File: NOTICE\n"
        "License-File: LICENSE-THIRD-PARTY.md\n\n"
        f"Source commit: {lock['source_commit']}\n"
    ).encode()
    entries[f"{dist}/WHEEL"] = (
        "Wheel-Version: 1.0\nGenerator: clb-reviewed-artifact\nRoot-Is-Purelib: false\n"
        + "".join(f"Tag: cp310-abi3-{p}\n" for p in platforms)
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
    target = output / f"terrio-{version}-cp310-abi3-{wheel_platform}.whl"
    if target.exists():
        raise FileExistsError(target)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, body in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, body)
    return target


def from_maturin(built: Path, licenses: Path, output: Path, lock: dict, key: str,
                 sys_platform: str, machine: str, license_sha256: dict) -> tuple[Path, dict]:
    """Repackage a pinned-source maturin wheel; return the wheel and its candidate entry."""
    match = re.fullmatch(r"terrio-[^-]+-cp310-abi3-([a-z0-9_.]+)\.whl", built.name)
    if not match:
        raise ValueError(f"expected a cp310-abi3 maturin wheel, got {built.name}")
    wheel_platform = match.group(1)
    python, native = {}, {}
    with zipfile.ZipFile(built) as archive:
        for info in archive.infolist():
            name = info.filename
            parts = PurePosixPath(name).parts
            if name != PurePosixPath(name).as_posix() or ".." in parts or name.startswith("/"):
                raise ValueError(f"unsafe maturin entry: {name}")
            if parts[0].endswith(".dist-info"):
                continue  # Replaced by the reviewed metadata.
            if parts[0] != "terrio" or info.is_dir():
                # e.g. terrio.libs/ from an auditwheel repair: a vendored shared
                # library the reviewed layout has no place for.
                raise ValueError(f"unexpected maturin entry: {name}")
            rel = "/".join(parts[1:])
            if rel.endswith(".py"):
                python[rel] = archive.read(info)
            elif rel.startswith("_terrio") and rel.endswith((".so", ".pyd")) and "/" not in rel:
                native[rel] = archive.read(info)
            elif rel not in ("_terrio.pyi", "py.typed"):
                raise ValueError(f"unexpected maturin entry: {name}")
    if set(python) != set(lock["python_sha256"]):
        raise ValueError(
            "maturin Python inventory differs from the lock: "
            f"missing {sorted(set(lock['python_sha256']) - set(python))}, "
            f"extra {sorted(set(python) - set(lock['python_sha256']))}"
        )
    different = [n for n, body in python.items() if sha256(body) != lock["python_sha256"][n]]
    if different:
        raise ValueError(f"Python files differ from the reviewed bytes: {different}")
    if len(native) != 1:
        raise ValueError(f"expected exactly one native extension, got {sorted(native)}")
    (native_name, native_body), = native.items()
    entry = {"sys_platform": sys_platform, "machine": machine, "file": native_name,
             "sha256": sha256(native_body), "wheel_platform": wheel_platform}
    candidate = dict(lock, native={key: entry})
    with tempfile.TemporaryDirectory() as tmp:
        package = Path(tmp)
        for rel, body in {**python, native_name: native_body}.items():
            (package / rel).parent.mkdir(parents=True, exist_ok=True)
            (package / rel).write_bytes(body)
        wheel = build(package, licenses, output, platform_view(candidate, key),
                      wheel_platform=wheel_platform, license_sha256=license_sha256)
    body = wheel.read_bytes()
    entry_record = {"key": key, "native": entry, "wheel": {
        "name": wheel.name, "bytes": len(body), "sha256": sha256(body)}}
    return wheel, entry_record


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lock", type=Path, default=ROOT / "pipeline/common/terrio-python.lock.json")
    parser.add_argument("--web-lock", type=Path, default=ROOT / "pipeline/common/terrio-assets.lock.json")
    sub = parser.add_subparsers(dest="command", required=True)
    wrap = sub.add_parser("wrap", help="package a reviewed artifact directory")
    wrap.add_argument("package", type=Path)
    wrap.add_argument("licenses", type=Path)
    wrap.add_argument("output", type=Path)
    wrap.add_argument("--platform", default="win_amd64", help="reviewed lock entry")
    mat = sub.add_parser("from-maturin", help="repackage a pinned-source CI build")
    mat.add_argument("wheel", type=Path)
    mat.add_argument("licenses", type=Path)
    mat.add_argument("output", type=Path)
    mat.add_argument("--platform", required=True, help="new lock entry key, e.g. linux_x86_64")
    mat.add_argument("--sys-platform", required=True)
    mat.add_argument("--machine", required=True)
    args = parser.parse_args(argv)
    lock = load_lock(args.lock)
    web = json.loads(args.web_lock.read_text())["sha256"]
    license_sha256 = {name: web[name] for name in LICENSES}
    if args.command == "wrap":
        result = build(args.package, args.licenses, args.output,
                       platform_view(lock, args.platform),
                       wheel_platform=lock["native"][args.platform]["wheel_platform"],
                       license_sha256=license_sha256)
        print(result)
        print(sha256(result.read_bytes()))
        return 0
    wheel, record = from_maturin(args.wheel, args.licenses, args.output, lock, args.platform,
                                 args.sys_platform, args.machine, license_sha256)
    reviewed = lock["native"].get(args.platform)
    if reviewed is not None:
        # A rebuild is a reproducibility observation, never a replacement: a
        # different digest needs a new identity, not these bytes under this name.
        identity = ("sys_platform", "machine", "file", "sha256", "wheel_platform")
        record["matches_reviewed_entry"] = all(reviewed[k] == record["native"][k] for k in identity)
    (args.output / f"{args.platform}.lock-entry.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
