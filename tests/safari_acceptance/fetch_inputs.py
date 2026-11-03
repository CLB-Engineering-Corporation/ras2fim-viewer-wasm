"""Fetch the pinned acceptance inputs; verify every byte before naming a file.

    python tests/safari_acceptance/fetch_inputs.py DATA_DIR FIXTURE_DIR

`data/*` land in DATA_DIR (the site build input), `fixtures/*` in FIXTURE_DIR
(the driver's VIEWER_ROOT/.terrio-validation/fixtures). Needs `git` with
origin/gh-pages fetched and an authenticated `gh` with draft-release access.
"""

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = "CLB-Engineering-Corporation/ras2fim-viewer-wasm"
TAG = "viewer-runtime-9c644f4"


def fetch(name, entry, tmp):
    if "gh_pages" in entry:
        return subprocess.run(["git", "show", f"origin/gh-pages:{entry['gh_pages']}"],
                              check=True, capture_output=True).stdout
    subprocess.run(["gh", "release", "download", TAG, "--repo", REPO, "--pattern",
                    entry["release_asset"], "--dir", tmp], check=True)
    return (Path(tmp) / entry["release_asset"]).read_bytes()


def main(data_dir, fixture_dir):
    pins = json.loads((Path(__file__).with_name("inputs.json")).read_text())["files"]
    with tempfile.TemporaryDirectory() as tmp:
        for name, entry in pins.items():
            body = fetch(name, entry, tmp)
            if hashlib.sha256(body).hexdigest() != entry["sha256"]:
                sys.exit(f"acceptance input {name} does not match its pin")
            folder, base = name.split("/", 1)
            target = Path(data_dir if folder == "data" else fixture_dir) / base
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                sys.exit(f"refusing to overwrite {target}")
            target.write_bytes(body)
            print(entry["sha256"], target)


if __name__ == "__main__":
    main(*sys.argv[1:3])
