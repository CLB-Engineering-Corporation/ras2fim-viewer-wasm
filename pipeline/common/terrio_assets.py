"""Explicit experimental Terrio assets, hashes and license provenance."""

from __future__ import annotations

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


def copy_package(source: Path, destination: Path) -> None:
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
                "experimental": True,
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
