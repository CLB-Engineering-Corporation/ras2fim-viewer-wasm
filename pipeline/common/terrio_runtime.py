"""Fail-closed provenance check for the reviewed native publication runtime.

`terrio-python.lock.json` holds one Python inventory, byte-identical on every
platform, and one reviewed native extension per platform. The guard selects
the entry for the running interpreter and refuses anything else: there is no
"closest match", and a platform without a reviewed artifact fails closed with
the explicit GDAL controls named.
"""

import hashlib
import importlib
import json
import platform
import sys
from functools import lru_cache
from pathlib import Path

LOCK = Path(__file__).with_name("terrio-python.lock.json")
NATIVE_SUFFIXES = (".pyd", ".so")
FALLBACK = "select --writer-backend gdal for COGs / --backend gdal for PMTiles"


def load_lock(path=LOCK):
    lock = json.loads(Path(path).read_text())
    if lock.get("schema_version") != 2:
        raise RuntimeError("Terrio Python lock must be schema_version 2")
    return lock


def platform_key(lock, sys_platform=None, machine=None):
    """The one reviewed native entry for this interpreter, or a fail-closed error."""
    sys_platform = sys.platform if sys_platform is None else sys_platform
    machine = platform.machine() if machine is None else machine
    matches = [
        key
        for key, entry in lock["native"].items()
        if entry["sys_platform"] == sys_platform
        and entry["machine"].lower() == machine.lower()
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"No reviewed Terrio native artifact for {sys_platform}/{machine} "
            f"(reviewed: {', '.join(sorted(lock['native']))}); {FALLBACK}."
        )
    return matches[0]


def platform_view(lock, key):
    """Single-platform inventory: every Python file plus that platform's extension.

    For ``win_amd64`` this is exactly the schema-1 object the reviewed Windows
    wheel and runtime bundle were produced from, so neither changes identity.
    """
    entry = lock["native"][key]
    if entry["file"] in lock["python_sha256"]:
        raise RuntimeError("Terrio native entry collides with the Python inventory")
    return {
        "schema_version": 1,
        "source_commit": lock["source_commit"],
        "version": lock["version"],
        "platform": key,
        "sha256": {**lock["python_sha256"], entry["file"]: entry["sha256"]},
    }


@lru_cache(maxsize=1)
def require_terrio():
    """Require reviewed package bytes, rather than a same-version PyPI build."""
    try:
        terrio = importlib.import_module("terrio")
        native = importlib.import_module("terrio._terrio")
    except ImportError as error:
        raise RuntimeError(
            "Pinned Terrio runtime is missing or cannot load. Install the reviewed artifact "
            f"for this platform (docs/terrio-assets.md), or {FALLBACK}."
        ) from error

    lock = load_lock()
    key = platform_key(lock)
    view = platform_view(lock, key)
    root = Path(terrio.__file__).resolve().parent
    origin = Path(native.__file__).resolve()
    locked_native = {lock["native"][key]["file"]}
    if origin.parent != root or origin.name not in locked_native:
        raise RuntimeError("Terrio loaded native binary does not match the reviewed inventory")
    competing = {p.name for p in root.glob("_terrio*") if p.suffix in NATIVE_SUFFIXES}
    if competing != locked_native:
        raise RuntimeError("Terrio competing native artifacts do not match the reviewed inventory")
    for name, expected in view["sha256"].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError(
                f"Terrio publication runtime does not match {lock['source_commit']} "
                f"({key}): {name}. Install the reviewed native artifact; see "
                f"docs/terrio-assets.md, or {FALLBACK}."
            )
    return terrio
