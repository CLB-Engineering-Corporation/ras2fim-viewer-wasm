"""Explicit experimental Terrio assets, hashes and license provenance."""

from __future__ import annotations

import argparse
import os
import tempfile
import hashlib
import json
import re
import shutil
from pathlib import Path, PurePosixPath

FILES = (
    "terrio.js",
    "terrio_bg.wasm",
    "terrio.d.ts",
    "terrio_bg.wasm.d.ts",
    "LICENSE",
    "NOTICE",
    "LICENSE-THIRD-PARTY.md",
    "package.json",
)


def copy_package(source: Path, destination: Path, *, pinned: bool = False) -> None:
    if pinned:
        verify_locked(source)
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Terrio package destination must be empty to exclude stale assets")
    missing = [name for name in FILES if not (source / name).is_file()]
    if missing:
        raise ValueError(f"incomplete Terrio web package: {missing}")
    if "module.exports" in (source / "terrio.js").read_text(encoding="utf-8"):
        raise ValueError("Terrio requires a web module, not a Node package")
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copy2(source / name, destination / name)
    if (source / "snippets").is_dir():
        shutil.copytree(source / "snippets", destination / "snippets")
    hashes = {
        p.relative_to(destination).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(destination.rglob("*"))
        if p.is_file()
    }
    (destination / "provenance.json").write_text(
        json.dumps(
            {
                "package": json.loads((source / "package.json").read_text(encoding="utf-8")),
                "sha256": hashes,
                "asset_policy": "locked" if pinned else "local-override",
                "source_commit": asset_lock()["source_commit"] if pinned else None,
                "ownership": "whole-file input copy; JS-owned typed output copies",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def verify_package(package: Path) -> list[str]:
    """Validate a complete inventory without following entries outside the package."""
    errors = []
    root = package.resolve()
    try:
        manifest = root / "provenance.json"
        if not manifest.resolve().is_relative_to(root):
            return ["Terrio provenance escapes package"]
        evidence = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(evidence, dict) or not isinstance(evidence.get("sha256"), dict):
            return ["invalid Terrio provenance schema"]
        hashes = evidence["sha256"]
        if evidence.get("asset_policy") == "locked":
            if evidence.get("source_commit") != asset_lock()["source_commit"]:
                errors.append("Terrio source commit does not match lock")
            if hashes != asset_lock()["sha256"]:
                errors.append("Terrio provenance does not match immutable asset lock")
        entries = list(root.rglob("*"))
        for path in entries:
            if not path.resolve().is_relative_to(root):
                errors.append(f"Terrio entry escapes package: {path.relative_to(root)}")
        actual = {p.relative_to(root).as_posix() for p in entries if p.is_file() and p != manifest}
        if not set(FILES).issubset(actual) or set(hashes) != actual:
            errors.append("Terrio inventory must cover every packaged asset, including snippets")
        for name, expected in hashes.items():
            parts = PurePosixPath(name)
            if (
                not name
                or parts.is_absolute()
                or ".." in parts.parts
                or "\\" in name
                or ":" in name
                or name != parts.as_posix()
            ):
                errors.append(f"unsafe Terrio inventory path: {name}")
                continue
            path = (root / name).resolve()
            if not path.is_relative_to(root):
                errors.append(f"Terrio asset escapes package: {name}")
                continue
            if not isinstance(expected, str) or re.fullmatch(r"[0-9a-f]{64}", expected) is None:
                errors.append(f"invalid Terrio hash: {name}")
            elif not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                errors.append(f"Terrio asset hash mismatch: {name}")
    except (OSError, ValueError, TypeError) as error:
        errors.append(f"invalid Terrio inventory: {error}")
    return errors


def asset_lock() -> dict:
    """Reviewed complete package inventory; no mutable remote URL is trusted."""
    return json.loads(Path(__file__).with_name("terrio-assets.lock.json").read_text(encoding="utf-8"))


def verify_locked(package: Path) -> None:
    lock = asset_lock()
    root = package.resolve()
    # npm metadata not served by copy_package is permitted; all runtime snippets
    # must be locked (this particular build generated none).
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    allowed = set(lock["sha256"]) | {"README.md", ".gitignore", "provenance.json"}
    if actual - allowed:
        raise ValueError(f"unlocked Terrio assets: {sorted(actual - allowed)}")
    for name, expected in lock["sha256"].items():
        path = root / name
        if not path.resolve().is_relative_to(root) or not path.is_file():
            raise ValueError(f"missing or escaping locked Terrio asset: {name}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"locked Terrio asset hash mismatch: {name}")
    if any(p.is_symlink() for p in root.rglob("*")):
        raise ValueError("Terrio asset symlinks are not permitted")


def cache_package() -> Path:
    cache = Path(os.environ.get("TERRIO_ASSET_CACHE", str(Path.home() / ".cache" / "ras2fim-terrio")))
    return cache / asset_lock()["source_commit"]


def resolve_package(override: str | None = None, *, reader_backend: str = "terrio") -> Path | None:
    if reader_backend not in ("terrio", "h5wasm"):
        raise ValueError(f"unknown reader backend: {reader_backend}")
    if reader_backend == "h5wasm":
        if override:
            raise ValueError("--terrio-package cannot be combined with --reader-backend h5wasm")
        return None
    if override:
        return Path(override)
    package = cache_package()
    try:
        verify_locked(package)
    except (OSError, ValueError) as error:
        raise ValueError(
            f"Pinned Terrio assets unavailable at {package}: {error}. "
            "Import the reviewed package with python -m pipeline.common.terrio_assets "
            "--package PATH; see docs/terrio-assets.md. Or explicitly select "
            "--reader-backend h5wasm. No automatic fallback is performed."
        ) from error
    return package


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify and cache the immutable Terrio viewer package")
    parser.add_argument("--package", required=True, type=Path)
    args = parser.parse_args(argv)
    verify_locked(args.package)
    target = cache_package()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        verify_locked(target)
        return 0
    with tempfile.TemporaryDirectory(prefix=".terrio-", dir=target.parent) as temporary:
        staged = Path(temporary) / "package"
        copy_package(args.package, staged, pinned=True)
        verify_locked(staged)
        staged.rename(target)
    print(f"Verified Terrio package cached at {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
