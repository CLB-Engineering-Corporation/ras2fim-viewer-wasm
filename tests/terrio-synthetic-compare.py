"""Compare a platform's synthetic default-dispatch report with the Windows reference.

    python tests/terrio-synthetic-compare.py REPORT_JSON

Gate: when this platform's GDAL produced byte-identical supplied arrays (same
source, same warp, same overview pyramid), Terrio's tile RGBA must be
byte-identical to the reviewed Windows wheel's -- otherwise the native build
itself behaves differently. When the supplied arrays differ, the cause is
upstream of Terrio (GDAL/PROJ on this platform) and Terrio identity cannot be
attributed; that is reported, with the GDAL-side comparison, not gated.
"""

import json
import sys
from pathlib import Path

reference = json.loads(Path(__file__).with_name("fixtures").joinpath("terrio-synthetic-reference.json").read_text())
report = json.loads(Path(sys.argv[1]).read_text())
assert report["source_values_sha256"] == reference["source_values_sha256"], "generated source differs"
summary, failed = [], False
for ref, got in zip(reference["profiles"], report["profiles"], strict=True):
    same_input = ref["supplied_level_sha256"] == got["supplied_level_sha256"]
    terrio_same = ref["terrio_tile_rgba_sha256"] == got["terrio_tile_rgba_sha256"]
    gdal_same = ref["gdal_tile_rgba_sha256"] == got["gdal_tile_rgba_sha256"]
    row = {"profile": ref["profile"], "supplied_arrays_identical_to_windows": same_input,
           "terrio_rgba_identical_to_windows": terrio_same,
           "gdal_rgba_identical_to_windows": gdal_same,
           "rgb_vs_gdal_pixels": [ref["rgb_different_pixels"], got["rgb_different_pixels"]],
           "rgb_vs_gdal_max": [ref["rgb_max_channel_difference"], got["rgb_max_channel_difference"]]}
    if same_input and not terrio_same:
        failed = True
        row["verdict"] = "FAIL: identical input, different Terrio output"
    elif not same_input:
        row["verdict"] = "not attributable: this platform's GDAL produced different supplied arrays"
    else:
        row["verdict"] = "Terrio output byte-identical to the reviewed Windows wheel"
    summary.append(row)
print(json.dumps(summary, indent=2))
sys.exit(1 if failed else 0)
