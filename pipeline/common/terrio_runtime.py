"""Fail-closed provenance check for the reviewed native publication runtime."""

import importlib
import hashlib
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def require_terrio():
    """Require reviewed package bytes, rather than a same-version PyPI build."""
    try:
        terrio = importlib.import_module("terrio")
        native = importlib.import_module("terrio._terrio")
    except ImportError as error:
        raise RuntimeError(
            "Pinned Terrio runtime is missing or cannot load. Install the reviewed artifact "
            "(docs/terrio-assets.md), or select --writer-backend gdal for COGs / "
            "--backend gdal for PMTiles."
        ) from error

    lock = json.loads(Path(__file__).with_name("terrio-python.lock.json").read_text())
    root = Path(terrio.__file__).resolve().parent
    origin = Path(native.__file__).resolve()
    locked_native = {name for name in lock["sha256"] if name.endswith((".pyd", ".so"))}
    if origin.parent != root or origin.name not in locked_native:
        raise RuntimeError("Terrio loaded native binary does not match the reviewed inventory")
    competing = {p.name for p in root.glob("_terrio*") if p.suffix in (".pyd", ".so")}
    if competing != locked_native:
        raise RuntimeError("Terrio competing native artifacts do not match the reviewed inventory")
    for name, expected in lock["sha256"].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError(
                f"Terrio publication runtime does not match {lock['source_commit']}: {name}. "
                "Install the reviewed native artifact; see docs/terrio-assets.md. "
                "Select the explicit GDAL backend to use the reference writer."
            )
    return terrio
